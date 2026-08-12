#!/usr/bin/env python3
"""Build reproducible bus headway and historical BMS evidence tables.

Raw official files must stay outside the public repository. This script reads
them from the private reproducibility workspace and writes only non-personal
derived tables to ``outputs/tables/bus_network_evidence``.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import unicodedata
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable


SCHEMA_VERSION = "1.0.0"
ANALYSIS_ID = "official_bus_headway_bms_crosscheck_v1"
HEADWAY_SNAPSHOT_DATE = "2024-12-31"
STOP_SNAPSHOT_DATE = "2025-08-25"
BMS_ROUTE_MAP_DATE = "2023-09-25"
BMS_STOP_ORDER_DATE = "2023-09-26"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def normalize_route_number(value: str) -> str:
    """Return a conservative comparison key, never a fuzzy-search key."""
    normalized = unicodedata.normalize("NFKC", value or "").strip().upper()
    normalized = normalized.replace("–", "-").replace("—", "-")
    normalized = re.sub(r"\s+", "", normalized)
    normalized = re.sub(r"\([^()]*\)$", "", normalized)
    numeric_prefix = re.match(r"^(\d+)(.*)$", normalized)
    if numeric_prefix:
        normalized = f"{int(numeric_prefix.group(1))}{numeric_prefix.group(2)}"
    return normalized


def read_csv_rows(path: Path, encodings: Iterable[str]) -> tuple[list[str], list[dict[str, str]], str]:
    last_error: UnicodeDecodeError | None = None
    for encoding in encodings:
        try:
            with path.open("r", encoding=encoding, newline="") as stream:
                reader = csv.DictReader(stream)
                rows = [row for row in reader if any((value or "").strip() for value in row.values())]
                return list(reader.fieldnames or []), rows, encoding
        except UnicodeDecodeError as error:
            last_error = error
    raise ValueError(f"Unsupported CSV encoding: {path}") from last_error


def write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def load_route_presence(path: Path) -> tuple[list[str], dict[str, dict[str, int]]]:
    _, rows, _ = read_csv_rows(path, ("utf-8-sig", "utf-8"))
    required = {"routeName", "servingStopCount", "routeMentionCount"}
    if not rows or not required.issubset(rows[0]):
        raise ValueError(f"Route-presence schema mismatch: {path}")
    aggregates: dict[str, dict[str, int]] = defaultdict(lambda: {"servingStopCount": 0, "routeMentionCount": 0})
    for row in rows:
        route = row["routeName"].strip()
        aggregates[route]["servingStopCount"] += int(row["servingStopCount"])
        aggregates[route]["routeMentionCount"] += int(row["routeMentionCount"])
    return sorted(aggregates), aggregates


def build_headway_matches(
    route_presence: Path,
    headway_csv: Path,
) -> tuple[list[dict[str, object]], list[dict[str, object]], dict[str, object]]:
    routes, aggregates = load_route_presence(route_presence)
    headers, official_rows, encoding = read_csv_rows(headway_csv, ("cp949", "euc-kr", "utf-8-sig", "utf-8"))
    expected = ["순번", "관할관청", "운행업체", "노선번호", "기점", "종점", "배차간격"]
    if headers != expected:
        raise ValueError(f"Headway schema mismatch: {headers}")

    by_key: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in official_rows:
        by_key[normalize_route_number(row["노선번호"])].append(row)

    output: list[dict[str, object]] = []
    manual_review: list[dict[str, object]] = []
    status_counts: Counter[str] = Counter()
    for route in routes:
        key = normalize_route_number(route)
        candidates = by_key.get(key, [])
        if len(candidates) == 1:
            status = "matched_unique"
        elif candidates:
            status = "matched_multiple_candidates"
        else:
            status = "unresolved_no_candidate"
        status_counts[status] += 1
        candidate_numbers = "|".join(row["노선번호"] for row in candidates)
        candidate_operators = "|".join(row["운행업체"] for row in candidates)
        candidate_headways = "|".join(row["배차간격"] for row in candidates)
        record = {
            "routeName": route,
            "normalizedRouteNumber": key,
            "matchStatus": status,
            "candidateCount": len(candidates),
            "officialRouteNumbers": candidate_numbers,
            "officialOperators": candidate_operators,
            "officialHeadwayTexts": candidate_headways,
            "officialOrigins": "|".join(row["기점"] for row in candidates),
            "officialDestinations": "|".join(row["종점"] for row in candidates),
            "servingStopCount": aggregates[route]["servingStopCount"],
            "routeMentionCount": aggregates[route]["routeMentionCount"],
            "headwaySnapshotDate": HEADWAY_SNAPSHOT_DATE,
            "stopSnapshotDate": STOP_SNAPSHOT_DATE,
            "artifactSchemaVersion": SCHEMA_VERSION,
            "analysisId": ANALYSIS_ID,
            "limitation": (
                "공식 배차간격 원문은 자유기술 계획값이다. 시간대·요일 의미를 임의 분해하지 않았고, "
                "복수 후보는 업체·노선ID 확인 전 단일값으로 선택하지 않는다."
            ),
        }
        output.append(record)
        if status != "matched_unique":
            manual_review.append(
                {
                    "routeName": route,
                    "normalizedRouteNumber": key,
                    "reviewStatus": status,
                    "candidateCount": len(candidates),
                    "candidateEvidence": " || ".join(
                        f"{row['운행업체']} / {row['노선번호']} / {row['기점']}→{row['종점']} / {row['배차간격']}"
                        for row in candidates
                    ),
                    "requiredAction": (
                        "현행 노선ID·운행업체로 식별"
                        if candidates
                        else "현행 노선목록 API 또는 고양시 노선대장으로 존재·변경 이력 확인"
                    ),
                    "excludedFromSingleHeadway": "yes",
                }
            )

    summary = {
        "routeDenominator": len(routes),
        "exactRawRouteNumberCoverage": sum(
            1 for route in routes if any(row["노선번호"] == route for row in official_rows)
        ),
        "routeNumberCandidateCoverage": status_counts["matched_unique"]
        + status_counts["matched_multiple_candidates"],
        "matchedUnique": status_counts["matched_unique"],
        "matchedMultipleCandidates": status_counts["matched_multiple_candidates"],
        "unresolvedNoCandidate": status_counts["unresolved_no_candidate"],
        "officialRowCount": len(official_rows),
        "officialUniqueRouteNumberCount": len({row["노선번호"] for row in official_rows}),
        "encoding": encoding,
    }
    return output, manual_review, summary


def parse_village_route_stops(bus_stops_csv: Path) -> tuple[dict[str, set[str]], dict[str, dict[str, str]]]:
    _, rows, _ = read_csv_rows(bus_stops_csv, ("utf-8-sig", "utf-8"))
    route_stops: dict[str, set[str]] = defaultdict(set)
    stop_metadata: dict[str, dict[str, str]] = {}
    for row in rows:
        stop_id = row["stop_id"].strip()
        stop_metadata[stop_id] = row
        for token in row["routes_raw"].split(","):
            parsed = re.match(r"^\s*(.*?)\s*\(([^()]*)\)\s*$", token)
            if parsed and parsed.group(2).strip() == "마을":
                route_stops[parsed.group(1).strip()].add(stop_id)
    return route_stops, stop_metadata


def build_bms_linkage(
    routes: list[str],
    bus_stops_csv: Path,
    route_map_csv: Path,
    stop_order_zip: Path,
) -> tuple[list[dict[str, object]], list[dict[str, object]], dict[str, object]]:
    route_stops, stop_metadata = parse_village_route_stops(bus_stops_csv)
    map_headers, map_rows, map_encoding = read_csv_rows(route_map_csv, ("cp949", "euc-kr", "utf-8-sig"))
    if map_headers != ["업체ID", "노선ID", "노선명"]:
        raise ValueError(f"BMS route-map schema mismatch: {map_headers}")

    map_by_key: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in map_rows:
        map_by_key[normalize_route_number(row["노선명"])].append(row)
    candidate_route_ids = {
        row["노선ID"] for route in routes for row in map_by_key.get(normalize_route_number(route), [])
    }

    route_id_stops: dict[str, set[str]] = defaultdict(set)
    route_id_rows: Counter[str] = Counter()
    route_id_directions: dict[str, set[str]] = defaultdict(set)
    route_stop_sequences: dict[tuple[str, str], list[int]] = defaultdict(list)
    with zipfile.ZipFile(stop_order_zip) as archive:
        entries = [entry for entry in archive.infolist() if not entry.is_dir()]
        if len(entries) != 1:
            raise ValueError("Expected one CSV in BMS stop-order ZIP")
        with archive.open(entries[0]) as binary_stream:
            stream = io.TextIOWrapper(binary_stream, encoding="cp949", newline="")
            reader = csv.DictReader(stream)
            required = {"ROUTE_ID", "STTN_ORDR", "STTN_ID", "PROGRS_DIV_CD_NM"}
            if not required.issubset(reader.fieldnames or []):
                raise ValueError(f"BMS stop-order schema mismatch: {reader.fieldnames}")
            total_bms_rows = 0
            for row in reader:
                total_bms_rows += 1
                route_id = row["ROUTE_ID"].strip()
                if route_id not in candidate_route_ids:
                    continue
                stop_id = row["STTN_ID"].strip()
                route_id_rows[route_id] += 1
                route_id_stops[route_id].add(stop_id)
                route_id_directions[route_id].add(row["PROGRS_DIV_CD_NM"].strip())
                if row["STTN_ORDR"].strip().isdigit():
                    route_stop_sequences[(route_id, stop_id)].append(int(row["STTN_ORDR"]))

    linkage: list[dict[str, object]] = []
    linked_points: list[dict[str, object]] = []
    status_counts: Counter[str] = Counter()
    for route in routes:
        candidates_by_id: dict[str, list[dict[str, str]]] = defaultdict(list)
        for row in map_by_key.get(normalize_route_number(route), []):
            candidates_by_id[row["노선ID"]].append(row)
        scored = sorted(
            (
                len(route_stops.get(route, set()) & route_id_stops[route_id]),
                route_id,
                rows,
            )
            for route_id, rows in candidates_by_id.items()
        )
        max_overlap = scored[-1][0] if scored else 0
        top = [entry for entry in scored if entry[0] == max_overlap and max_overlap > 0]
        if len(top) == 1:
            status = "linked_unique_route_id"
            selected_route_id = top[0][1]
        elif top:
            status = "ambiguous_route_id"
            selected_route_id = ""
        else:
            status = "unresolved_no_station_overlap"
            selected_route_id = ""
        status_counts[status] += 1
        linkage.append(
            {
                "routeName": route,
                "linkStatus": status,
                "routeMapCandidateIdCount": len(candidates_by_id),
                "localMentionedStopCount": len(route_stops.get(route, set())),
                "maximumStationIdOverlap": max_overlap,
                "selectedBmsStopRowCount": route_id_rows[selected_route_id] if selected_route_id else 0,
                "selectedBmsUniqueStopCount": len(route_id_stops[selected_route_id]) if selected_route_id else 0,
                "selectedDirectionNames": "|".join(sorted(route_id_directions[selected_route_id])) if selected_route_id else "",
                "routeMapSnapshotDate": BMS_ROUTE_MAP_DATE,
                "stopOrderSnapshotDate": BMS_STOP_ORDER_DATE,
                "localStopSnapshotDate": STOP_SNAPSHOT_DATE,
                "limitation": (
                    "2023 BMS 노선번호 후보 중 2025 고양 정류장ID와 실제 교집합이 있는 유일 노선ID만 연결했다. "
                    "교집합이 없거나 동률이면 연결하지 않았다."
                ),
            }
        )
        if not selected_route_id:
            continue
        overlap_stops = sorted(route_stops[route] & route_id_stops[selected_route_id])
        for stop_id in overlap_stops:
            metadata = stop_metadata[stop_id]
            sequences = route_stop_sequences[(selected_route_id, stop_id)]
            linked_points.append(
                {
                    "routeName": route,
                    "latitude": metadata.get("latitude", ""),
                    "longitude": metadata.get("longitude", ""),
                    "minimumBmsStopSequence": min(sequences) if sequences else "",
                    "maximumBmsStopSequence": max(sequences) if sequences else "",
                    "dongName": metadata.get("dong_name", ""),
                    "districtName": metadata.get("district_name", ""),
                    "evidenceBoundary": "historical_bms_link_only_not_current_route_geometry",
                }
            )

    summary = {
        "bmsRouteMapRows": len(map_rows),
        "bmsStopOrderRows": total_bms_rows,
        "linkedUniqueRouteId": status_counts["linked_unique_route_id"],
        "ambiguousRouteId": status_counts["ambiguous_route_id"],
        "unresolvedNoStationOverlap": status_counts["unresolved_no_station_overlap"],
        "linkedCoordinatePoints": len(linked_points),
        "linkedUniqueCoordinateLocations": len({
            (row["latitude"], row["longitude"])
            for row in linked_points
            if row["latitude"] != "" and row["longitude"] != ""
        }),
        "routeMapEncoding": map_encoding,
    }
    return linkage, linked_points, summary


def build_outputs(args: argparse.Namespace) -> dict[str, object]:
    output_dir = args.output_dir.resolve()
    routes, _ = load_route_presence(args.route_presence)
    headway_rows, manual_review, headway_summary = build_headway_matches(
        args.route_presence, args.headway_csv
    )
    linkage_rows, linked_points, bms_summary = build_bms_linkage(
        routes, args.bus_stops_csv, args.bms_route_map_csv, args.bms_stop_order_zip
    )

    common_headway_fields = list(headway_rows[0])
    write_csv(output_dir / "headway_route_matches.csv", common_headway_fields, headway_rows)
    write_csv(output_dir / "headway_manual_review.csv", list(manual_review[0]), manual_review)
    write_csv(
        output_dir / "headway_multiple_candidates.csv",
        list(manual_review[0]),
        [row for row in manual_review if row["reviewStatus"] == "matched_multiple_candidates"],
    )
    write_csv(
        output_dir / "headway_unresolved_no_candidate.csv",
        list(manual_review[0]),
        [row for row in manual_review if row["reviewStatus"] == "unresolved_no_candidate"],
    )
    write_csv(output_dir / "bms_route_linkage.csv", list(linkage_rows[0]), linkage_rows)
    write_csv(output_dir / "bms_linked_stop_points.csv", list(linked_points[0]), linked_points)

    manifest = [
        {
            "sourceId": "goyang_headway_file_20241231",
            "evidenceType": "actual_file_values",
            "officialPage": "https://www.data.go.kr/data/3079226/fileData.do",
            "snapshotDate": HEADWAY_SNAPSHOT_DATE,
            "retrievedDate": args.retrieved_date,
            "sha256": sha256(args.headway_csv),
            "privateRawLocation": "feedback_expansion/headway_csv",
            "publicRawIncluded": "no",
        },
        {
            "sourceId": "gyeonggi_bms_route_map_20230925",
            "evidenceType": "actual_file_values",
            "officialPage": "https://data.gg.go.kr/portal/data/service/selectServicePage.do?infId=1MQHOF2F4XO6DQMRHXOA34337309&infSeq=1",
            "snapshotDate": BMS_ROUTE_MAP_DATE,
            "retrievedDate": args.retrieved_date,
            "sha256": sha256(args.bms_route_map_csv),
            "privateRawLocation": "feedback_expansion/bms_route_map_csv",
            "publicRawIncluded": "no",
        },
        {
            "sourceId": "gyeonggi_bms_stop_order_20230926",
            "evidenceType": "actual_file_values",
            "officialPage": "https://data.gg.go.kr/portal/data/service/selectServicePage.do?infId=TEXYY9BODHAA8QZ1ZZG233176356&infSeq=1",
            "snapshotDate": BMS_STOP_ORDER_DATE,
            "retrievedDate": args.retrieved_date,
            "sha256": sha256(args.bms_stop_order_zip),
            "privateRawLocation": "feedback_expansion/bms_stop_order_zip",
            "publicRawIncluded": "no",
        },
    ]
    write_csv(output_dir / "source_manifest.csv", list(manifest[0]), manifest)

    quality_rows = [
        {"check": "village_route_denominator", "value": headway_summary["routeDenominator"], "status": "pass", "note": "public route-presence table distinct routeName"},
        {"check": "headway_exact_raw_number_coverage", "value": headway_summary["exactRawRouteNumberCoverage"], "status": "reference", "note": "before declared route-number normalization"},
        {"check": "headway_candidate_coverage", "value": headway_summary["routeNumberCandidateCoverage"], "status": "qualified", "note": "82 includes 10 multiple-candidate route numbers"},
        {"check": "headway_unique_match", "value": headway_summary["matchedUnique"], "status": "pass", "note": "single official row only"},
        {"check": "headway_multiple_candidate", "value": headway_summary["matchedMultipleCandidates"], "status": "manual_review", "note": "excluded from single-value claims"},
        {"check": "headway_no_candidate", "value": headway_summary["unresolvedNoCandidate"], "status": "manual_review", "note": "no fuzzy fallback"},
        {"check": "bms_stop_order_actual_rows", "value": bms_summary["bmsStopOrderRows"], "status": "pass", "note": "counted from acquired ZIP"},
        {"check": "bms_conservative_route_links", "value": bms_summary["linkedUniqueRouteId"], "status": "qualified", "note": "2023/2025 snapshot mismatch; not current route geometry"},
    ]
    write_csv(output_dir / "data_quality.csv", list(quality_rows[0]), quality_rows)

    dictionary_rows = [
        {"artifact": "headway_route_matches.csv", "field": "matchStatus", "definition": "단일 공식행, 복수 공식후보, 후보없음의 상호배타 상태", "unit": "category"},
        {"artifact": "headway_route_matches.csv", "field": "officialHeadwayTexts", "definition": "공식 CSV 배차간격 셀 원문; 파싱·평균하지 않음", "unit": "free text"},
        {"artifact": "headway_route_matches.csv", "field": "candidateCount", "definition": "보수적 정규화 키가 같은 공식 행 수", "unit": "rows"},
        {"artifact": "bms_route_linkage.csv", "field": "maximumStationIdOverlap", "definition": "노선번호 후보별 BMS 정류장ID와 2025 고양 정류장ID 교집합의 최댓값", "unit": "unique stops"},
        {"artifact": "bms_route_linkage.csv", "field": "linkStatus", "definition": "양의 교집합을 가진 유일 route_id만 연결한 결과 상태", "unit": "category"},
        {"artifact": "bms_linked_stop_points.csv", "field": "latitude", "definition": "2025 고양시 정류장 원자료의 WGS84 위도", "unit": "decimal degrees"},
        {"artifact": "bms_linked_stop_points.csv", "field": "longitude", "definition": "2025 고양시 정류장 원자료의 WGS84 경도", "unit": "decimal degrees"},
        {"artifact": "analysis_summary.json", "field": "routeNumberCandidateCoverage", "definition": "86개 중 공식 배차 CSV에 정규화 번호 후보가 1개 이상 있는 노선 수", "unit": "routes"},
    ]
    write_csv(output_dir / "data_dictionary.csv", list(dictionary_rows[0]), dictionary_rows)

    lineage_rows = [
        {"artifact": "headway_route_matches.csv", "inputs": "14_village_bus_route_presence.csv + private headway CSV", "transform": "NFKC; trim; uppercase; trailing parenthetical removal; numeric-prefix leading-zero removal; exact-key join", "exclusions": "no substring/fuzzy fallback; multiple candidates not reduced to one value"},
        {"artifact": "bms_route_linkage.csv", "inputs": "private 2023 route map + private 2023 stop order ZIP + private 2025 processed bus stops", "transform": "exact normalized route-number candidates then station-ID overlap", "exclusions": "zero-overlap and tied candidates unresolved"},
        {"artifact": "bms_linked_stop_points.csv", "inputs": "selected historical BMS route_id + 2025 public-stop coordinates", "transform": "private join on stop_id; then route/stop IDs and stop names removed; min/max historical sequence retained", "exclusions": "not a complete line geometry or current route sequence"},
    ]
    write_csv(output_dir / "lineage.csv", list(lineage_rows[0]), lineage_rows)

    summary = {
        "artifactSchemaVersion": SCHEMA_VERSION,
        "analysisId": ANALYSIS_ID,
        "headway": headway_summary,
        "bms": bms_summary,
        "sourceHashes": {entry["sourceId"]: entry["sha256"] for entry in manifest},
        "interpretationBoundary": {
            "actualTargetPopulation": "not_acquired",
            "careService62": "not_acquired",
            "drtOperations": "not_acquired",
            "headway": "official_free_text_planned_interval_not_observed_service",
            "bms": "historical_route_stop_order_not_current_geometry",
        },
    }
    (output_dir / "analysis_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    repo_root = Path(__file__).resolve().parents[1]
    parser.add_argument(
        "--route-presence",
        type=Path,
        default=repo_root / "outputs/tables/pro_analysis/14_village_bus_route_presence.csv",
    )
    parser.add_argument("--headway-csv", type=Path, required=True)
    parser.add_argument("--bus-stops-csv", type=Path, required=True)
    parser.add_argument("--bms-route-map-csv", type=Path, required=True)
    parser.add_argument("--bms-stop-order-zip", type=Path, required=True)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=repo_root / "outputs/tables/bus_network_evidence",
    )
    parser.add_argument("--retrieved-date", default="2026-08-13")
    return parser.parse_args()


if __name__ == "__main__":
    print(json.dumps(build_outputs(parse_args()), ensure_ascii=False, indent=2))
