from __future__ import annotations

import argparse
import hashlib
import csv
import json
from pathlib import Path
from typing import Any, Iterable


APP_ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = APP_ROOT / "public" / "data" / "data.js"
OUTPUT_PATH = APP_ROOT / "public" / "data" / "boundaries.js"

SOURCE_URL = (
    "https://github.com/vuski/admdongkor/blob/master/"
    "ver20260401/HangJeongDong_ver20260401.geojson"
)
SOURCE_REPOSITORY_URL = "https://github.com/vuski/admdongkor"
GOYANG_CODE_PREFIXES = ("41281", "41285", "41287")
VIEWBOX_WIDTH = 900.0
VIEWBOX_HEIGHT = 660.0
PADDING = 18.0


def load_dashboard_data(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8").strip()
    prefix = "window.DDOL_V2_DATA = "
    if not text.startswith(prefix) or not text.endswith(";"):
        raise ValueError("data.js 형식을 확인하세요.")
    return json.loads(text[len(prefix) : -1])


def polygon_rings(geometry: dict[str, Any]) -> Iterable[list[list[float]]]:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates", [])
    if geometry_type == "Polygon":
        yield from coordinates
        return
    if geometry_type == "MultiPolygon":
        for polygon in coordinates:
            yield from polygon
        return
    raise ValueError(f"지원하지 않는 geometry: {geometry_type}")


def outer_rings(geometry: dict[str, Any]) -> Iterable[list[list[float]]]:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates", [])
    if geometry_type == "Polygon":
        if coordinates:
            yield coordinates[0]
        return
    if geometry_type == "MultiPolygon":
        for polygon in coordinates:
            if polygon:
                yield polygon[0]
        return
    raise ValueError(f"지원하지 않는 geometry: {geometry_type}")


def signed_area(ring: list[list[float]]) -> float:
    area = 0.0
    for index, point in enumerate(ring):
        next_point = ring[(index + 1) % len(ring)]
        area += point[0] * next_point[1] - next_point[0] * point[1]
    return area / 2.0


def ring_centroid(ring: list[list[float]]) -> tuple[float, float]:
    area = signed_area(ring)
    if abs(area) < 1e-12:
        return (
            sum(point[0] for point in ring) / len(ring),
            sum(point[1] for point in ring) / len(ring),
        )
    cx = 0.0
    cy = 0.0
    for index, point in enumerate(ring):
        next_point = ring[(index + 1) % len(ring)]
        cross = point[0] * next_point[1] - next_point[0] * point[1]
        cx += (point[0] + next_point[0]) * cross
        cy += (point[1] + next_point[1]) * cross
    factor = 1.0 / (6.0 * area)
    return cx * factor, cy * factor


def fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def load_inside_points(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    inside = [row for row in rows if row.get("spatial_join_status") == "inside"]
    if not inside:
        raise ValueError(f"경계 안 점 데이터가 없습니다: {path}")
    return inside


def point_in_ring(point: tuple[float, float], ring: list[list[float]]) -> bool:
    x, y = point
    inside = False
    previous = ring[-1]
    for current in ring:
        x1, y1 = previous
        x2, y2 = current
        crosses = (y1 > y) != (y2 > y)
        if crosses:
            intersection_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < intersection_x:
                inside = not inside
        previous = current
    return inside


def geometry_contains(geometry: dict[str, Any], point: tuple[float, float]) -> bool:
    coordinates = geometry.get("coordinates", [])
    polygons = [coordinates] if geometry.get("type") == "Polygon" else coordinates
    for polygon in polygons:
        if not polygon or not point_in_ring(point, polygon[0]):
            continue
        if any(point_in_ring(point, hole) for hole in polygon[1:]):
            continue
        return True
    return False


def build(
    source_path: Path,
    dashboard_data_path: Path,
    bus_stops_path: Path,
    facilities_path: Path,
) -> dict[str, Any]:
    dashboard = load_dashboard_data(dashboard_data_path)
    area_by_code = {str(area["code"]): area for area in dashboard["areas"]}
    source_bytes = source_path.read_bytes()
    geojson = json.loads(source_bytes.decode("utf-8"))
    source_features = [
        feature
        for feature in geojson.get("features", [])
        if str(feature.get("properties", {}).get("adm_cd2", "")).startswith(
            GOYANG_CODE_PREFIXES
        )
    ]

    if len(source_features) != 44:
        raise ValueError(f"고양시 행정동 경계는 44개여야 합니다: {len(source_features)}")

    all_points = [
        point
        for feature in source_features
        for ring in polygon_rings(feature["geometry"])
        for point in ring
    ]
    min_x = min(point[0] for point in all_points)
    max_x = max(point[0] for point in all_points)
    min_y = min(point[1] for point in all_points)
    max_y = max(point[1] for point in all_points)
    usable_width = VIEWBOX_WIDTH - 2 * PADDING
    usable_height = VIEWBOX_HEIGHT - 2 * PADDING
    scale = min(usable_width / (max_x - min_x), usable_height / (max_y - min_y))
    rendered_width = (max_x - min_x) * scale
    rendered_height = (max_y - min_y) * scale
    offset_x = (VIEWBOX_WIDTH - rendered_width) / 2.0
    offset_y = (VIEWBOX_HEIGHT - rendered_height) / 2.0

    def project(point: list[float] | tuple[float, float]) -> tuple[float, float]:
        x = offset_x + (point[0] - min_x) * scale
        y = offset_y + (max_y - point[1]) * scale
        return x, y

    features = []
    unmatched = []
    for feature in source_features:
        code = str(feature.get("properties", {}).get("adm_cd2", ""))
        area = area_by_code.get(code)
        if area is None:
            unmatched.append(code)
            continue

        path_parts = []
        for ring in polygon_rings(feature["geometry"]):
            points = [project(point) for point in ring]
            if not points:
                continue
            path_parts.append(
                "M"
                + "L".join(f"{fmt(x)},{fmt(y)}" for x, y in points)
                + "Z"
            )

        largest_ring = max(outer_rings(feature["geometry"]), key=lambda ring: abs(signed_area(ring)))
        label_x, label_y = project(ring_centroid(largest_ring))
        feature_points = [
            project(point)
            for ring in polygon_rings(feature["geometry"])
            for point in ring
        ]
        features.append(
            {
                "code": str(area["code"]),
                "district": area["district"],
                "dong": area["dong"],
                "path": "".join(path_parts),
                "labelX": round(label_x, 2),
                "labelY": round(label_y, 2),
                "bbox": [
                    round(min(point[0] for point in feature_points), 2),
                    round(min(point[1] for point in feature_points), 2),
                    round(max(point[0] for point in feature_points), 2),
                    round(max(point[1] for point in feature_points), 2),
                ],
            }
        )

    if unmatched or len(features) != 44:
        raise ValueError(f"경계-데이터 코드 연결 실패: unmatched={unmatched}, count={len(features)}")

    features.sort(key=lambda item: item["dong"])

    bus_rows = load_inside_points(bus_stops_path)
    facility_rows = load_inside_points(facilities_path)

    def inside_display_boundary(row: dict[str, str]) -> bool:
        point = (float(row["longitude"]), float(row["latitude"]))
        return any(geometry_contains(feature["geometry"], point) for feature in source_features)

    def project_row(row: dict[str, str]) -> tuple[float, float]:
        return project((float(row["longitude"]), float(row["latitude"])))

    bus_points = []
    for row in bus_rows:
        x, y = project_row(row)
        bus_points.append([
            round(x, 2),
            round(y, 2),
            str(row["adm_cd2"]),
            int(float(row["route_count"])),
        ])

    medical_points = []
    pharmacy_points = []
    for row in facility_rows:
        x, y = project_row(row)
        point = [round(x, 2), round(y, 2), str(row["adm_cd2"])]
        if row["facility_layer"] == "약국":
            pharmacy_points.append(point)
        else:
            medical_points.append(point)

    if len(bus_points) != 2095:
        raise ValueError(f"경계 안 정류장은 2,095개여야 합니다: {len(bus_points)}")
    if len(medical_points) != 1397 or len(pharmacy_points) != 495:
        raise ValueError(
            "경계 안 시설은 병·의원 등 1,397개, 약국 495개여야 합니다: "
            f"{len(medical_points)}, {len(pharmacy_points)}"
        )

    bus_display_inside = sum(inside_display_boundary(row) for row in bus_rows)
    medical_display_inside = sum(
        inside_display_boundary(row)
        for row in facility_rows
        if row["facility_layer"] != "약국"
    )
    pharmacy_display_inside = sum(
        inside_display_boundary(row)
        for row in facility_rows
        if row["facility_layer"] == "약국"
    )

    return {
        "metadata": {
            "title": "고양시 44개 행정동 분석·표시 경계",
            "featureCount": len(features),
            "viewBox": f"0 0 {int(VIEWBOX_WIDTH)} {int(VIEWBOX_HEIGHT)}",
            "source": "admdongkor 2026-04-01 행정동 경계 (SGIS 기반 가공)",
            "sourceUrl": SOURCE_URL,
            "sourceRepositoryUrl": SOURCE_REPOSITORY_URL,
            "sourceVersionDate": "2026-04-01",
            "sourceCrs": geojson.get("crs", {}).get("properties", {}).get("name", "EPSG:5179"),
            "sourceSha256": hashlib.sha256(source_bytes).hexdigest().upper(),
            "licenseStatus": "CC BY 4.0(가공부분) + SGIS 공공누리 제1유형(원천), 출처표시 필수",
            "analysisBoundaryAsOf": "2026-04-01",
            "displayOnly": False,
            "pointLayerNotice": "제출·재현분석에 사용한 공개 공급자료의 익명 표시점이며 고양온돌 대상자·62개 서비스 거점이 아님",
        },
        "features": features,
        "layers": {
            "busStops": {
                "label": "경계 안 버스정류장",
                "count": len(bus_points),
                "asOf": "2025-08-25",
                "sourceSha256": sha256(bus_stops_path),
                "displayInsideCount": bus_display_inside,
                "displayClippedCount": len(bus_points) - bus_display_inside,
                "points": bus_points,
            },
            "medicalFacilities": {
                "label": "병·의원 등 요양기관",
                "count": len(medical_points),
                "asOf": "2026-06-30",
                "sourceSha256": sha256(facilities_path),
                "displayInsideCount": medical_display_inside,
                "displayClippedCount": len(medical_points) - medical_display_inside,
                "points": medical_points,
            },
            "pharmacies": {
                "label": "약국",
                "count": len(pharmacy_points),
                "asOf": "2026-06-30",
                "sourceSha256": sha256(facilities_path),
                "displayInsideCount": pharmacy_display_inside,
                "displayClippedCount": len(pharmacy_points) - pharmacy_display_inside,
                "points": pharmacy_points,
            },
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="공개 재배포 가능한 admdongkor 경계와 익명 공급점을 MVP SVG 데이터로 변환합니다."
    )
    parser.add_argument("--boundary", type=Path, required=True)
    parser.add_argument("--bus-stops", type=Path, required=True)
    parser.add_argument("--facilities", type=Path, required=True)
    parser.add_argument("--dashboard-data", type=Path, default=DATA_PATH)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = build(
        args.boundary,
        args.dashboard_data,
        args.bus_stops,
        args.facilities,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "window.DDOL_V2_BOUNDARIES = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"WROTE {args.output}")
    print(
        f"FEATURES={len(payload['features'])} "
        f"BUS={payload['layers']['busStops']['count']} "
        f"MEDICAL={payload['layers']['medicalFacilities']['count']} "
        f"PHARMACY={payload['layers']['pharmacies']['count']} "
        f"SOURCE_SHA256={payload['metadata']['sourceSha256']}"
    )


if __name__ == "__main__":
    main()
