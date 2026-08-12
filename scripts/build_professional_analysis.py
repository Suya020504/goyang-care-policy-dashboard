from __future__ import annotations

import csv
import hashlib
import html
import json
import math
import os
import re
import sys
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


APP_ROOT = Path(__file__).resolve().parents[1]
ANALYSIS_ROOT = Path(
    os.environ.get("DDOL_ANALYSIS_ROOT", APP_ROOT.parent / "2026-08-09_재현분석")
).resolve()
ANALYSIS_TABLES = ANALYSIS_ROOT / "outputs" / "tables"
ANALYSIS_PROCESSED = ANALYSIS_ROOT / "data" / "processed"
ANALYSIS_SOURCE = ANALYSIS_ROOT / "src"

# 기존 재현분석의 검정 구현을 그대로 재사용해 공간명세만 비교한다.
sys.path.insert(0, str(ANALYSIS_ROOT))
from src.metrics import (  # noqa: E402
    compute_grid_accessibility,
    local_moran_permutation,
    moran_permutation_test,
    score_dss,
    zscore,
)


OUTPUT_TABLE_DIR = APP_ROOT / "outputs" / "tables" / "pro_analysis"
OUTPUT_FIGURE_DIR = APP_ROOT / "outputs" / "figures" / "pro_analysis"
OUTPUT_JS = APP_ROOT / "public" / "data" / "pro_analysis.js"
OUTPUT_REPORT = APP_ROOT / "reports" / "PRO_ANALYSIS_METHOD.md"

SCHEMA_VERSION = "1.2.0"
LEGACY_CSV_SCHEMA_VERSION = "1.1.0"
ARTIFACT_DATE = "2026-08-13"
SNAPSHOT_ID = "goyang_mixed_20250825_20260630"
MODEL_ID = "poster_proxy_v1"
SEED = 42
PERMUTATIONS = 9_999
WALKING_SPEED_MPS = 0.8
BASE_WEIGHTS = (0.50, 0.30, 0.20)
THRESHOLD_MINUTES = (5, 10, 15, 30)

# 아래 값은 관측된 똑버스 운영값이 아니라, 심사 피드백에 답하기 위한 공개 가정이다.
# 실제 전후효과로 오해하지 않도록 분석명·필드명·보고서에서 모두 scenario로만 표기한다.
ACCESS_TIME_THRESHOLDS_MIN = (30, 45)
DRT_WAIT_SCENARIOS_MIN = (5, 10, 15)
DRT_FIXED_ACCESS_EGRESS_MIN = 5.0
DRT_NETWORK_DISTANCE_FACTOR = 1.30
DRT_IN_VEHICLE_SPEED_KMH = 15.0

CANDIDATE_DONGS = [
    "가좌동",
    "고양동",
    "관산동",
    "능곡동",
    "송포동",
    "주교동",
    "행주동",
    "효자동",
]

FOCUS_DONGS = ["관산동", "행주동", "대화동"]
VILLAGE_ROUTE_TYPE = "마을"
ROUTE_TOKEN_PATTERN = re.compile(r"^\s*(.*?)\s*\(([^()]*)\)\s*$")
DSS_COMPONENTS = [
    ("cag", "CAG", "cag"),
    ("bus", "버스 비효율", "bus_inefficiency_raw"),
    ("facility", "의료시설 평균 최근접거리", "facility_dispersion_raw_m"),
]

SOURCE_DATES = {
    "population": "2026-06-30",
    "onePersonHouseholds": "2026-06-30",
    "hiraFacilities": "2026-06-30",
    "analysisBoundary": "2026-04-01",
    "busStops": "2025-08-25",
}

INPUT_PATHS = {
    "area_scores": (
        ANALYSIS_TABLES / "area_scores.csv",
        "44개 행정동 기준 시나리오·구성요소·후보 플래그",
    ),
    "grid_scores": (
        ANALYSIS_PROCESSED / "grid_scores.csv",
        "EPSG:5179 100m 격자와 의료시설 최근접거리",
    ),
    "area_adjacency": (
        ANALYSIS_TABLES / "area_adjacency.csv",
        "Queen 공유꼭짓점 인접관계",
    ),
    "facilities": (
        ANALYSIS_PROCESSED / "facilities.csv",
        "HIRA 병의원등·약국 공간분석 중간표",
    ),
    "bus_stops": (
        ANALYSIS_PROCESSED / "bus_stops.csv",
        "고양시 정류장·경유노선 유형의 행정동 공간결합 중간표",
    ),
    "source_manifest": (
        ANALYSIS_TABLES / "source_manifest.csv",
        "원자료 기준일·SHA-256 계보",
    ),
    "model_spec": (
        ANALYSIS_ROOT / "outputs" / "models" / "model_spec.json",
        "기준 대리모형 명세",
    ),
    "metrics_code": (
        ANALYSIS_SOURCE / "metrics.py",
        "z표준화·접근성·Moran·LISA 구현",
    ),
}

RAW_SOURCE_IDS = [
    "population",
    "one_person",
    "admdongkor_boundary",
    "bus_stops",
    "hira_hospital",
    "hira_pharmacy",
]

COMMON_CSV_COLUMNS = [
    "artifact_schema_version",
    "analysis_id",
    "snapshot_id",
    "source_dates",
    "unit_definition",
    "formula",
    "limitation",
    "input_sha256",
    "raw_source_sha256",
]
ACCESS_TIME_TABLE_FILES = {
    "15_access_time_scenario_assumptions.csv",
    "16_access_time_scenarios_by_candidate.csv",
    "17_access_time_scenario_ranges.csv",
    "18_access_time_data_quality.csv",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def relative_input_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(APP_ROOT.parent.resolve()).as_posix()
    except ValueError:
        # 공개 저장소에서 외부의 검증된 재현분석 입력을 지정해도 로컬 절대경로를 노출하지 않는다.
        relative_to_analysis = resolved.relative_to(ANALYSIS_ROOT)
        return (Path("2026-08-09_재현분석") / relative_to_analysis).as_posix()


def build_input_manifest() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for input_id, (path, role) in INPUT_PATHS.items():
        if not path.is_file():
            raise FileNotFoundError(f"필수 입력이 없습니다: {input_id}")
        rows.append(
            {
                "inputId": input_id,
                "role": role,
                "relativePath": relative_input_path(path),
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
        )
    return rows


def load_raw_source_manifest() -> list[dict[str, Any]]:
    source = pd.read_csv(INPUT_PATHS["source_manifest"][0], dtype=str).fillna("")
    source = source.loc[source["source_id"].isin(RAW_SOURCE_IDS)].copy()
    if set(source["source_id"]) != set(RAW_SOURCE_IDS):
        missing = sorted(set(RAW_SOURCE_IDS) - set(source["source_id"]))
        raise ValueError(f"원자료 매니페스트 누락: {missing}")
    source = source.set_index("source_id").loc[RAW_SOURCE_IDS].reset_index()
    return [
        {
            "sourceId": row.source_id,
            "snapshotDate": row.snapshot_date,
            "sha256": row.sha256,
            "status": row.status,
            "license": row.license,
        }
        for row in source.itertuples(index=False)
    ]


def manifest_hash_string(input_manifest: list[dict[str, Any]]) -> str:
    return "|".join(
        f"{row['inputId']}={row['sha256']}" for row in sorted(input_manifest, key=lambda x: x["inputId"])
    )


def raw_hash_string(raw_manifest: list[dict[str, Any]]) -> str:
    return "|".join(f"{row['sourceId']}={row['sha256']}" for row in raw_manifest)


def source_dates_string() -> str:
    return "|".join(f"{key}={value}" for key, value in SOURCE_DATES.items())


def as_bool(series: pd.Series) -> pd.Series:
    if pd.api.types.is_bool_dtype(series):
        return series.astype(bool)
    return series.astype(str).str.strip().str.lower().map({"true": True, "false": False, "1": True, "0": False})


def load_inputs() -> tuple[
    pd.DataFrame,
    pd.DataFrame,
    pd.DataFrame,
    pd.DataFrame,
    pd.DataFrame,
]:
    area = pd.read_csv(INPUT_PATHS["area_scores"][0], dtype={"adm_cd2": str})
    grid = pd.read_csv(INPUT_PATHS["grid_scores"][0], dtype={"adm_cd2": str})
    adjacency = pd.read_csv(
        INPUT_PATHS["area_adjacency"][0],
        dtype={"origin_adm_cd2": str, "destination_adm_cd2": str},
    )
    facilities = pd.read_csv(INPUT_PATHS["facilities"][0], dtype={"adm_cd2": str})
    bus_stops = pd.read_csv(
        INPUT_PATHS["bus_stops"][0],
        dtype={"adm_cd2": str, "stop_id": str, "stop_number": str},
    )
    area["candidate_top8"] = as_bool(area["candidate_top8"])
    area["current_drt_flag"] = area["current_drt_flag"].astype(int)
    return area, grid, adjacency, facilities, bus_stops


def validate_inputs(
    area: pd.DataFrame,
    grid: pd.DataFrame,
    adjacency: pd.DataFrame,
    facilities: pd.DataFrame,
    bus_stops: pd.DataFrame,
) -> None:
    required_area = {
        "adm_cd2",
        "dong_name",
        "district_name",
        "candidate_top8",
        "current_drt_flag",
        "cag",
        "demand_index",
        "demand_index_corrected_65plus",
        "demand_index_without_single70",
        "ri_proxy",
        "bus_inefficiency_raw",
        "facility_dispersion_raw_m",
        "dss_raw",
        "rank_global",
        "centroid_x_5179",
        "centroid_y_5179",
    }
    required_grid = {"adm_cd2", "dong_name", "x_5179", "y_5179", "nearest_facility_m"}
    required_facility = {"facility_layer", "x_5179", "y_5179"}
    required_bus = {
        "stop_id",
        "routes_raw",
        "route_count",
        "adm_cd2",
        "dong_name",
        "spatial_join_status",
    }
    for label, frame, required in (
        ("area", area, required_area),
        ("grid", grid, required_grid),
        ("facilities", facilities, required_facility),
    ):
        missing = sorted(required - set(frame.columns))
        if missing:
            raise ValueError(f"{label} 필수 필드 누락: {missing}")
        if frame[list(required)].isna().any().any():
            raise ValueError(f"{label} 필수 필드에 결측이 있습니다.")

    missing_bus = sorted(required_bus - set(bus_stops.columns))
    if missing_bus:
        raise ValueError(f"bus_stops 필수 필드 누락: {missing_bus}")
    if bus_stops[["stop_id", "routes_raw", "route_count", "spatial_join_status"]].isna().any().any():
        raise ValueError("bus_stops 파싱 필수 필드에 결측이 있습니다.")

    if len(area) != 44 or area["adm_cd2"].nunique() != 44 or area["dong_name"].nunique() != 44:
        raise ValueError("행정동은 코드·동명 기준 44개 유일해야 합니다.")
    if len(grid) != 26_595 or grid["adm_cd2"].nunique() != 44:
        raise ValueError("100m 격자는 26,595개이며 44동에 모두 연결되어야 합니다.")
    if grid.duplicated(["adm_cd2", "x_5179", "y_5179"]).any():
        raise ValueError("100m 격자에 행정동·좌표 중복이 있습니다.")
    if not np.isfinite(grid["nearest_facility_m"].to_numpy(dtype=float)).all():
        raise ValueError("의료시설 최근접거리에 비유한 값이 있습니다.")
    if grid["nearest_facility_m"].lt(0).any():
        raise ValueError("의료시설 최근접거리는 음수일 수 없습니다.")
    if len(facilities) != 1_893:
        raise ValueError("HIRA 입력은 병의원등 1,397개와 약국 496개여야 합니다.")
    if len(bus_stops) != 2_099 or bus_stops["stop_id"].nunique() != 2_099:
        raise ValueError("정류장 입력은 고유 정류장 2,099개여야 합니다.")
    if int(bus_stops["spatial_join_status"].eq("inside").sum()) != 2_095:
        raise ValueError("행정동 경계 안 정류장은 2,095개여야 합니다.")
    if bus_stops.loc[bus_stops["spatial_join_status"].eq("inside"), "adm_cd2"].isna().any():
        raise ValueError("경계 안 정류장은 모두 행정동 코드가 있어야 합니다.")
    if not set(
        bus_stops.loc[bus_stops["spatial_join_status"].eq("inside"), "adm_cd2"]
    ).issubset(set(area["adm_cd2"])):
        raise ValueError("정류장에 44동 계약 밖 코드가 있습니다.")
    layer_counts = facilities.groupby("facility_layer").size().to_dict()
    if layer_counts != {"병의원등": 1_397, "약국": 496}:
        raise ValueError(f"HIRA 계층 건수가 다릅니다: {layer_counts}")

    candidate_set = set(area.loc[area["candidate_top8"], "dong_name"])
    if candidate_set != set(CANDIDATE_DONGS) or int(area["candidate_top8"].sum()) != 8:
        raise ValueError("기준 후보 8개 집합이 고정 계약과 다릅니다.")
    if int(area["current_drt_flag"].sum()) != 3:
        raise ValueError("현행 DRT 비교용 팀 매핑은 3개 행정동이어야 합니다.")
    if area.loc[area["candidate_top8"], "current_drt_flag"].any():
        raise ValueError("기준 후보와 과거 팀 사후 대리매핑 3동은 겹치지 않아야 합니다.")
    if not set(grid["adm_cd2"]).issubset(set(area["adm_cd2"])):
        raise ValueError("격자에 44동 계약 밖 코드가 있습니다.")
    if adjacency.empty:
        raise ValueError("Queen 인접관계가 비어 있습니다.")


def jaccard(left: set[str], right: set[str]) -> float:
    return len(left & right) / len(left | right) if left or right else 1.0


def ordered_dongs(values: Iterable[str]) -> list[str]:
    candidate_order = {dong: index for index, dong in enumerate(CANDIDATE_DONGS)}
    return sorted(set(values), key=lambda dong: (candidate_order.get(dong, len(CANDIDATE_DONGS)), dong))


def eligible_top8(area: pd.DataFrame, scores: np.ndarray) -> tuple[set[str], pd.DataFrame]:
    scored = area[["adm_cd2", "dong_name", "current_drt_flag"]].copy()
    scored["score"] = np.asarray(scores, dtype=float)
    eligible = scored.loc[scored["current_drt_flag"].eq(0)].copy()
    eligible["rank"] = eligible["score"].rank(method="min", ascending=False).astype(int)
    top = set(eligible.loc[eligible["rank"].le(8), "dong_name"])
    if len(top) != 8:
        raise ValueError(f"상위 8 집합에 동점으로 {len(top)}개가 포함됐습니다.")
    return top, eligible


def evaluate_weight_grid(
    area: pd.DataFrame,
    normalized: np.ndarray,
    baseline: set[str],
    weight_rows_pct: Iterable[tuple[int, int, int]],
    scenario_prefix: str = "",
) -> dict[str, Any]:
    eligible_codes = area.loc[area["current_drt_flag"].eq(0), ["adm_cd2", "dong_name"]].copy()
    inclusion = {row.dong_name: 0 for row in eligible_codes.itertuples(index=False)}
    ranks = {row.dong_name: [] for row in eligible_codes.itertuples(index=False)}
    scenario_rows: list[dict[str, Any]] = []

    for weight_cag_pct, weight_bus_pct, weight_facility_pct in weight_rows_pct:
        weights = np.array([weight_cag_pct, weight_bus_pct, weight_facility_pct], dtype=float) / 100
        scores = normalized @ weights
        top8, eligible = eligible_top8(area, scores)
        for row in eligible.itertuples(index=False):
            ranks[row.dong_name].append(int(row.rank))
        for dong in top8:
            inclusion[dong] += 1
        intersection = len(top8 & baseline)
        if scenario_prefix:
            scenario_id = (
                f"{scenario_prefix}wc{weight_cag_pct:03d}_wb{weight_bus_pct:03d}_wf{weight_facility_pct:03d}"
            )
        else:
            scenario_id = (
                f"wc{weight_cag_pct:02d}_wb{weight_bus_pct:02d}_wf{weight_facility_pct:02d}"
            )
        scenario_rows.append(
            {
                "scenarioId": scenario_id,
                "weightCag": weight_cag_pct / 100,
                "weightBus": weight_bus_pct / 100,
                "weightFacility": weight_facility_pct / 100,
                "intersectionCount": intersection,
                "jaccardVsBaseline": jaccard(top8, baseline),
                "top8Dongs": ordered_dongs(top8),
                "outDongs": ordered_dongs(baseline - top8),
                "inDongs": ordered_dongs(top8 - baseline),
            }
        )

    area_rows: list[dict[str, Any]] = []
    by_dong = area.set_index("dong_name")
    for row in eligible_codes.sort_values("adm_cd2").itertuples(index=False):
        dong_ranks = ranks[row.dong_name]
        area_rows.append(
            {
                "code": row.adm_cd2,
                "dong": row.dong_name,
                "count": inclusion[row.dong_name],
                "share": inclusion[row.dong_name] / len(scenario_rows),
                "baselineCandidate": bool(by_dong.loc[row.dong_name, "candidate_top8"]),
                "minRank": min(dong_ranks),
                "medianRank": float(np.median(dong_ranks)),
                "maxRank": max(dong_ranks),
            }
        )

    stable = ordered_dongs(
        row["dong"]
        for row in area_rows
        if row["baselineCandidate"] and row["count"] == len(scenario_rows)
    )
    conditional = ordered_dongs(
        row["dong"]
        for row in area_rows
        if row["baselineCandidate"] and row["count"] < len(scenario_rows)
    )
    alternatives = ordered_dongs(
        row["dong"] for row in area_rows if not row["baselineCandidate"] and row["count"] > 0
    )
    return {
        "scenarioCount": len(scenario_rows),
        "minJaccard": min(row["jaccardVsBaseline"] for row in scenario_rows),
        "stableDongs": stable,
        "conditionalDongs": conditional,
        "alternativeDongs": alternatives,
        "scenarios": scenario_rows,
        "inclusionRows": area_rows,
    }


def compute_weight_sensitivity(
    area: pd.DataFrame,
) -> tuple[
    dict[str, Any],
    dict[str, list[dict[str, Any]]],
    dict[str, list[dict[str, Any]]],
]:
    baseline = set(area.loc[area["candidate_top8"], "dong_name"])
    normalized = np.column_stack(
        [
            zscore(area["cag"]),
            zscore(area["bus_inefficiency_raw"]),
            zscore(area["facility_dispersion_raw_m"]),
        ]
    )
    bounded_weights = [
        (weight_cag_pct, weight_bus_pct, 100 - weight_cag_pct - weight_bus_pct)
        for weight_cag_pct in range(30, 71, 5)
        for weight_bus_pct in range(15, 51, 5)
        if 10 <= 100 - weight_cag_pct - weight_bus_pct <= 40
    ]
    bounded = evaluate_weight_grid(area, normalized, baseline, bounded_weights)
    if bounded["scenarioCount"] != 45:
        raise ValueError(
            f"명시한 제한 범위 가중치 시나리오는 45개여야 합니다: {bounded['scenarioCount']}"
        )
    base_row = next(
        row
        for row in bounded["scenarios"]
        if (row["weightCag"], row["weightBus"], row["weightFacility"]) == BASE_WEIGHTS
    )
    if set(base_row["top8Dongs"]) != baseline:
        raise ValueError("50·30·20 기준 시나리오가 후보 8개를 보존하지 못했습니다.")

    full_simplex_weights = [
        (weight_cag_pct, weight_bus_pct, 100 - weight_cag_pct - weight_bus_pct)
        for weight_cag_pct in range(0, 101, 5)
        for weight_bus_pct in range(0, 101 - weight_cag_pct, 5)
    ]
    boundary = evaluate_weight_grid(
        area,
        normalized,
        baseline,
        full_simplex_weights,
        scenario_prefix="boundary_",
    )
    if boundary["scenarioCount"] != 231:
        raise ValueError(
            f"전체 비음수 simplex 경계감사는 231개여야 합니다: {boundary['scenarioCount']}"
        )

    formula = (
        "DSS(w)=w_cag*z(CAG)+w_bus*z(bus_inefficiency)+w_facility*z(nearest_facility_mean_m); "
        "44동에서 z표준화 후 과거 팀 사후 대리매핑 3동을 상위8 선정에서 제외"
    )
    limitation = (
        "45개 조합은 명시한 제한 범위의 스트레스 격자이며 실제 가중치 분포·확률이 아니다. "
        "기준 후보 8개를 대체하거나 확정 순위를 만들지 않는다."
    )
    boundary_limitation = (
        "0.05 간격 전체 비음수 simplex 231개는 실제 정책에서 타당한 가중치 집합으로 가정하지 않는다. "
        "제한 범위 밖 극단값을 포함해 45개 결과의 경계 의존성을 반증하는 감사용이며 포함수는 확률이 아니다."
    )
    boundary_payload = {
        "analysisId": "weight_simplex_boundary_audit_v1",
        "purpose": "명시한 45개 제한 범위 결과의 경계 의존성 반증",
        "formula": formula,
        "unit": "가중치 0~1; Jaccard 0~1; 포함수 0~231; 순위 1~41",
        "limitation": boundary_limitation,
        "bounds": {
            "cag": {"min": 0.0, "max": 1.0},
            "bus": {"min": 0.0, "max": 1.0},
            "facility": {"min": 0.0, "max": 1.0},
            "step": 0.05,
            "sum": 1.0,
        },
        **boundary,
    }
    payload = {
        "analysisId": "bounded_weight_simplex_v1",
        "formula": formula,
        "unit": "가중치 0~1; Jaccard 0~1; 포함수 0~45; 순위 1~41",
        "limitation": limitation,
        "bounds": {
            "cag": {"min": 0.30, "max": 0.70},
            "bus": {"min": 0.15, "max": 0.50},
            "facility": {"min": 0.10, "max": 0.40},
            "step": 0.05,
            "sum": 1.0,
        },
        **bounded,
        "boundaryAudit": boundary_payload,
    }
    tables = {
        "01_weight_scenarios.csv": bounded["scenarios"],
        "02_weight_area_stability.csv": bounded["inclusionRows"],
    }
    boundary_tables = {
        "02a_weight_boundary_scenarios.csv": boundary["scenarios"],
        "02b_weight_boundary_area_stability.csv": boundary["inclusionRows"],
    }
    return payload, tables, boundary_tables


def compute_facility_coverage(
    area: pd.DataFrame, grid: pd.DataFrame
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    threshold_distances = {
        minute: minute * 60 * WALKING_SPEED_MPS for minute in THRESHOLD_MINUTES
    }
    working = grid[["adm_cd2", "dong_name", "nearest_facility_m"]].copy()
    for minute, distance in threshold_distances.items():
        working[f"coverage{minute}"] = working["nearest_facility_m"].le(distance)

    aggregate_spec: dict[str, tuple[str, Any]] = {
        "gridCount": ("nearest_facility_m", "size"),
        "meanNearestFacilityM": ("nearest_facility_m", "mean"),
        "p90NearestFacilityM": ("nearest_facility_m", lambda values: values.quantile(0.9)),
    }
    for minute in THRESHOLD_MINUTES:
        aggregate_spec[f"coverage{minute}"] = (f"coverage{minute}", "mean")
    area_coverage = working.groupby(["adm_cd2", "dong_name"], as_index=False).agg(**aggregate_spec)
    area_flags = area[["adm_cd2", "district_name", "candidate_top8", "current_drt_flag"]]
    area_coverage = area_coverage.merge(area_flags, on="adm_cd2", how="left", validate="one_to_one")
    if area_coverage["candidate_top8"].isna().any():
        raise ValueError("격자 커버리지와 44동 후보 플래그가 완전히 연결되지 않았습니다.")

    area_rows: list[dict[str, Any]] = []
    for row in area_coverage.sort_values("adm_cd2").itertuples(index=False):
        area_rows.append(
            {
                "code": row.adm_cd2,
                "district": row.district_name,
                "dong": row.dong_name,
                "candidate": bool(row.candidate_top8),
                "currentDrtMapped": bool(row.current_drt_flag),
                "gridCount": int(row.gridCount),
                "coverage5": float(row.coverage5),
                "coverage10": float(row.coverage10),
                "coverage15": float(row.coverage15),
                "coverage30": float(row.coverage30),
                "meanNearestFacilityM": float(row.meanNearestFacilityM),
                "p90NearestFacilityM": float(row.p90NearestFacilityM),
            }
        )

    group_rows: list[dict[str, Any]] = []
    for group_id, flag in (("candidate", True), ("nonCandidate", False)):
        selected = area_coverage.loc[area_coverage["candidate_top8"].eq(flag)]
        group_rows.append(
            {
                "group": group_id,
                "areaCount": len(selected),
                "coverage5": float(selected["coverage5"].median()),
                "coverage10": float(selected["coverage10"].median()),
                "coverage15": float(selected["coverage15"].median()),
                "coverage30": float(selected["coverage30"].median()),
                "meanNearestFacilityM": float(selected["meanNearestFacilityM"].median()),
                "p90NearestFacilityM": float(selected["p90NearestFacilityM"].median()),
            }
        )
    group_by_id = {row["group"]: row for row in group_rows}
    formula = (
        "coverage_t=100m 격자 중 nearest_facility_m <= t*60*0.8m/s 인 격자 비율; "
        "그룹값은 동별 비율의 비가중 중앙값"
    )
    limitation = (
        "면적격자 비율이며 주민·돌봄대상자 비율이 아니다. 직선보행 대리값으로 도로망·경사·대기·환승을 포함하지 않는다. "
        "후보식에 시설거리가 포함되어 후보/비후보 차이는 독립 검증이 아니다."
    )
    payload = {
        "analysisId": "facility_grid_coverage_v1",
        "formula": formula,
        "unit": "coverage 0~1 면적격자 비율; distance m; time min; speed m/s",
        "limitation": limitation,
        "walkingSpeedMps": WALKING_SPEED_MPS,
        "gridSizeM": 100,
        "thresholdMinutes": list(THRESHOLD_MINUTES),
        "thresholdDistancesM": [threshold_distances[minute] for minute in THRESHOLD_MINUTES],
        "areaRows": area_rows,
        "candidateMedian": group_by_id["candidate"],
        "nonCandidateMedian": group_by_id["nonCandidate"],
    }
    tables = {
        "03_facility_coverage_by_area.csv": area_rows,
        "04_facility_coverage_group_medians.csv": group_rows,
    }
    return payload, tables


def compute_accessibility_time_scenarios(
    area: pd.DataFrame, grid: pd.DataFrame
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    """Compare the existing walk-distance proxy with transparent DRT assumptions.

    This is deliberately not an estimate of observed before/after impact. The only
    varying assumption is pickup waiting time; all other scenario parameters are
    fixed and published in the output so reviewers can replace them later.
    """

    if ACCESS_TIME_THRESHOLDS_MIN != (30, 45):
        raise ValueError("이 분석의 공개 커버리지 계약은 30분·45분이어야 합니다.")

    area_flags = area[
        ["adm_cd2", "district_name", "dong_name", "candidate_top8", "current_drt_flag"]
    ].copy()
    working = grid[["adm_cd2", "dong_name", "nearest_facility_m", "x_5179", "y_5179"]].merge(
        area_flags,
        on=["adm_cd2", "dong_name"],
        how="left",
        validate="many_to_one",
    )
    if working[["district_name", "candidate_top8", "current_drt_flag"]].isna().any().any():
        raise ValueError("격자와 행정동 후보 플래그가 완전히 연결되지 않았습니다.")

    candidate_grid = working.loc[working["candidate_top8"]].copy()
    if candidate_grid["adm_cd2"].nunique() != len(CANDIDATE_DONGS):
        raise ValueError("시간 시나리오의 후보 행정동 수가 8개가 아닙니다.")

    distance = candidate_grid["nearest_facility_m"].astype(float)
    candidate_grid["referenceWalkingMinutes"] = distance / (WALKING_SPEED_MPS * 60.0)
    drt_speed_m_per_min = DRT_IN_VEHICLE_SPEED_KMH * 1_000.0 / 60.0
    candidate_grid["breakEvenWaitMinutes"] = (
        candidate_grid["referenceWalkingMinutes"]
        - DRT_FIXED_ACCESS_EGRESS_MIN
        - DRT_NETWORK_DISTANCE_FACTOR * distance / drt_speed_m_per_min
    )

    assumption_rows: list[dict[str, Any]] = []
    scenario_rows: list[dict[str, Any]] = []
    for wait_minutes in DRT_WAIT_SCENARIOS_MIN:
        scenario_id = f"wait_{wait_minutes:02d}m"
        scenario_label = f"가정 대기 {wait_minutes}분"
        assumption_rows.append(
            {
                "scenarioId": scenario_id,
                "scenarioLabel": scenario_label,
                "waitMinutes": wait_minutes,
                "fixedAccessEgressMinutes": DRT_FIXED_ACCESS_EGRESS_MIN,
                "networkDistanceFactor": DRT_NETWORK_DISTANCE_FACTOR,
                "inVehicleSpeedKmh": DRT_IN_VEHICLE_SPEED_KMH,
                "assumedTransfers": 0,
                "assumptionStatus": "analyst_defined_not_observed",
            }
        )
        scenario_column = f"scenarioMinutes_{wait_minutes:02d}"
        candidate_grid[scenario_column] = (
            DRT_FIXED_ACCESS_EGRESS_MIN
            + wait_minutes
            + DRT_NETWORK_DISTANCE_FACTOR * distance / drt_speed_m_per_min
        )

        for dong in CANDIDATE_DONGS:
            selected = candidate_grid.loc[candidate_grid["dong_name"].eq(dong)]
            if selected.empty:
                raise ValueError(f"시간 시나리오 후보 격자가 없습니다: {dong}")
            reference = selected["referenceWalkingMinutes"]
            scenario = selected[scenario_column]
            scenario_rows.append(
                {
                    "scenarioId": scenario_id,
                    "scenarioLabel": scenario_label,
                    "waitMinutes": wait_minutes,
                    "code": str(selected["adm_cd2"].iloc[0]),
                    "district": str(selected["district_name"].iloc[0]),
                    "dong": dong,
                    "gridCount": len(selected),
                    "referenceMedianMinutes": float(reference.median()),
                    "referenceP90Minutes": float(reference.quantile(0.9)),
                    "referenceCoverage30": float(reference.le(30).mean()),
                    "referenceCoverage45": float(reference.le(45).mean()),
                    "scenarioMedianMinutes": float(scenario.median()),
                    "scenarioP90Minutes": float(scenario.quantile(0.9)),
                    "scenarioCoverage30": float(scenario.le(30).mean()),
                    "scenarioCoverage45": float(scenario.le(45).mean()),
                    "medianTimeChangeMinutes": float((scenario - reference).median()),
                    "p90TimeChangeMinutes": float(scenario.quantile(0.9) - reference.quantile(0.9)),
                    "coverage30ChangePercentagePoints": float(
                        100.0 * (scenario.le(30).mean() - reference.le(30).mean())
                    ),
                    "coverage45ChangePercentagePoints": float(
                        100.0 * (scenario.le(45).mean() - reference.le(45).mean())
                    ),
                    "scenarioFasterGridShare": float(scenario.lt(reference).mean()),
                }
            )

    range_rows: list[dict[str, Any]] = []
    for dong in CANDIDATE_DONGS:
        selected_rows = [row for row in scenario_rows if row["dong"] == dong]
        if len(selected_rows) != len(DRT_WAIT_SCENARIOS_MIN):
            raise ValueError(f"대기시간 3개 범위가 완전하지 않습니다: {dong}")
        first = selected_rows[0]
        selected_grid = candidate_grid.loc[candidate_grid["dong_name"].eq(dong)]
        break_even_wait = selected_grid["breakEvenWaitMinutes"]
        range_rows.append(
            {
                "code": first["code"],
                "district": first["district"],
                "dong": dong,
                "gridCount": first["gridCount"],
                "referenceMedianMinutes": first["referenceMedianMinutes"],
                "referenceP90Minutes": first["referenceP90Minutes"],
                "referenceCoverage30": first["referenceCoverage30"],
                "referenceCoverage45": first["referenceCoverage45"],
                "scenarioMedianMinutesLow": min(row["scenarioMedianMinutes"] for row in selected_rows),
                "scenarioMedianMinutesHigh": max(row["scenarioMedianMinutes"] for row in selected_rows),
                "scenarioP90MinutesLow": min(row["scenarioP90Minutes"] for row in selected_rows),
                "scenarioP90MinutesHigh": max(row["scenarioP90Minutes"] for row in selected_rows),
                "medianTimeChangeMinutesLow": min(
                    row["medianTimeChangeMinutes"] for row in selected_rows
                ),
                "medianTimeChangeMinutesHigh": max(
                    row["medianTimeChangeMinutes"] for row in selected_rows
                ),
                "scenarioCoverage30Low": min(row["scenarioCoverage30"] for row in selected_rows),
                "scenarioCoverage30High": max(row["scenarioCoverage30"] for row in selected_rows),
                "coverage30ChangePercentagePointsLow": min(
                    row["coverage30ChangePercentagePoints"] for row in selected_rows
                ),
                "coverage30ChangePercentagePointsHigh": max(
                    row["coverage30ChangePercentagePoints"] for row in selected_rows
                ),
                "scenarioCoverage45Low": min(row["scenarioCoverage45"] for row in selected_rows),
                "scenarioCoverage45High": max(row["scenarioCoverage45"] for row in selected_rows),
                "coverage45ChangePercentagePointsLow": min(
                    row["coverage45ChangePercentagePoints"] for row in selected_rows
                ),
                "coverage45ChangePercentagePointsHigh": max(
                    row["coverage45ChangePercentagePoints"] for row in selected_rows
                ),
                "scenarioFasterGridShareLow": min(
                    row["scenarioFasterGridShare"] for row in selected_rows
                ),
                "scenarioFasterGridShareHigh": max(
                    row["scenarioFasterGridShare"] for row in selected_rows
                ),
                "breakEvenWaitP25Minutes": float(break_even_wait.quantile(0.25)),
                "breakEvenWaitMedianMinutes": float(break_even_wait.median()),
                "breakEvenWaitP75Minutes": float(break_even_wait.quantile(0.75)),
                "nonnegativeBreakEvenWaitGridShare": float(break_even_wait.ge(0).mean()),
            }
        )

    all_distances = working["nearest_facility_m"].astype(float)
    data_quality_rows = [
        {
            "gridRowCount": len(working),
            "uniqueGridCoordinateCount": int(
                working[["adm_cd2", "x_5179", "y_5179"]].drop_duplicates().shape[0]
            ),
            "requiredFieldMissingCount": int(
                working[
                    [
                        "adm_cd2",
                        "dong_name",
                        "x_5179",
                        "y_5179",
                        "nearest_facility_m",
                        "candidate_top8",
                    ]
                ].isna().sum().sum()
            ),
            "duplicateGridCoordinateCount": int(
                working.duplicated(["adm_cd2", "x_5179", "y_5179"]).sum()
            ),
            "negativeDistanceCount": int(all_distances.lt(0).sum()),
            "candidateAreaCount": int(area["candidate_top8"].sum()),
            "nonCandidateAreaCount": int((~area["candidate_top8"]).sum()),
            "currentDrtMappedAreaCount": int(area["current_drt_flag"].sum()),
            "candidateGridCount": len(candidate_grid),
            "distanceMinM": float(all_distances.min()),
            "distanceMedianM": float(all_distances.median()),
            "distanceP90M": float(all_distances.quantile(0.9)),
            "distanceP99M": float(all_distances.quantile(0.99)),
            "distanceMaxM": float(all_distances.max()),
            "outlierPolicy": "상위거리 절단·대체 없음; P99·최댓값을 보고하고 원값 보존",
            "targetStatus": "독립 예측 타깃 없음; candidate_top8은 필터, current_drt_flag는 미사용",
            "idPolicy": "adm_cd2는 결합·추적에만 사용하고 시간식 입력에서 제외",
            "leakagePolicy": "사후 current_drt_flag와 후보 점수·순위는 이동시간 계산에 사용하지 않음",
        }
    ]

    formula = (
        "reference_minutes=nearest_facility_m/(0.8m/s*60); "
        "scenario_minutes=5분 접근·승하차+대기(5|10|15분)+1.3*nearest_facility_m/(15km/h); "
        "coverage_t=100m 면적격자 중 minutes<=t 비율; delta_pp=100*(scenario-reference); "
        "break_even_wait=reference_minutes-5분-1.3*nearest_facility_m/(15km/h)"
    )
    limitation = (
        "실제 도입 전후·인과효과·예측값이 아니라 의료시설까지의 공개 가정 시나리오다. "
        "HIRA 최근접 시설은 62개 돌봄서비스 목적지가 아니고 면적격자는 대상자 비율이 아니다. "
        "버스 배차·환승·도로망·호출거절·공유승차 우회·요금·보행부담을 관측하지 않았으며, "
        "5·10·15분 범위는 대기시간 한 축만 바꾼 시나리오 범위이지 신뢰구간이나 운영효과 범위가 아니다."
    )
    payload = {
        "analysisId": "candidate_access_time_assumption_scenarios_v1",
        "decisionQuestion": (
            "실제 운영자료가 없을 때 후보별 의료시설 도달 가능성이 대기시간 가정에 얼마나 달라지는가"
        ),
        "formula": formula,
        "unit": "time min; coverage 0~1 equal-area grid share; change percentage points; speed km/h",
        "limitation": limitation,
        "effectStatus": "hypothetical_scenario_not_observed_before_after",
        "referenceLabel": "최근접 HIRA 시설까지 0.8m/s 직선보행 대리",
        "scenarioLabel": "환승 0회 가정의 단일 DRT 이동시간 시나리오",
        "coverageThresholdMinutes": list(ACCESS_TIME_THRESHOLDS_MIN),
        "waitScenarioMinutes": list(DRT_WAIT_SCENARIOS_MIN),
        "assumptions": {
            "walkingSpeedMps": WALKING_SPEED_MPS,
            "fixedAccessEgressMinutes": DRT_FIXED_ACCESS_EGRESS_MIN,
            "networkDistanceFactor": DRT_NETWORK_DISTANCE_FACTOR,
            "inVehicleSpeedKmh": DRT_IN_VEHICLE_SPEED_KMH,
            "assumedTransfers": 0,
            "waitTimeWeight": 1.0,
            "assumptionStatus": "analyst_defined_not_observed",
        },
        "scenarioRangePolicy": (
            "후보별 최솟값·최댓값은 대기 5·10·15분 세 가정에서만 계산하며 확률·신뢰구간이 아니다."
        ),
        "breakEvenWaitDefinition": (
            "각 격자에서 가정 DRT 시간이 보행대리 기준시간 이하가 되는 최대 대기분; "
            "음수면 대기 0분이어도 고정 접근·승하차 시간 때문에 더 느리다는 뜻"
        ),
        "dataQuality": data_quality_rows[0],
        "scenarios": assumption_rows,
        "candidateRows": scenario_rows,
        "candidateRangeRows": range_rows,
    }
    tables = {
        "15_access_time_scenario_assumptions.csv": assumption_rows,
        "16_access_time_scenarios_by_candidate.csv": scenario_rows,
        "17_access_time_scenario_ranges.csv": range_rows,
        "18_access_time_data_quality.csv": data_quality_rows,
    }
    return payload, tables


def queen_matrix(area: pd.DataFrame, adjacency: pd.DataFrame) -> tuple[pd.DataFrame, np.ndarray]:
    ordered = area.sort_values("adm_cd2").reset_index(drop=True)
    index = {str(code): position for position, code in enumerate(ordered["adm_cd2"])}
    matrix = np.zeros((len(ordered), len(ordered)), dtype=float)
    for row in adjacency.itertuples(index=False):
        left = index.get(str(row.origin_adm_cd2))
        right = index.get(str(row.destination_adm_cd2))
        if left is not None and right is not None and left != right:
            matrix[left, right] = 1.0
    matrix = np.maximum(matrix, matrix.T)
    np.fill_diagonal(matrix, 0)
    if (matrix.sum(axis=1) == 0).any():
        raise ValueError("Queen 인접행렬에 고립 행정동이 있습니다.")
    return ordered, matrix


def symmetric_knn_matrix(ordered: pd.DataFrame, k: int) -> np.ndarray:
    xy = ordered[["centroid_x_5179", "centroid_y_5179"]].to_numpy(dtype=float)
    squared_distance = ((xy[:, None, :] - xy[None, :, :]) ** 2).sum(axis=2)
    np.fill_diagonal(squared_distance, np.inf)
    nearest = np.argsort(squared_distance, axis=1, kind="mergesort")[:, :k]
    directed = np.zeros((len(ordered), len(ordered)), dtype=float)
    for origin, destinations in enumerate(nearest):
        directed[origin, destinations] = 1.0
    matrix = np.maximum(directed, directed.T)
    np.fill_diagonal(matrix, 0)
    return matrix


def compute_spatial_sensitivity(
    area: pd.DataFrame, adjacency: pd.DataFrame
) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    ordered, queen = queen_matrix(area, adjacency)
    specifications = [
        ("queen", "2026-04-01 분석경계 공유꼭짓점 Queen, 대칭", queen),
        ("symmetricKnn4", "EPSG:5179 면적중심 최근접 4개 directed 관계의 대칭 합집합", symmetric_knn_matrix(ordered, 4)),
        ("symmetricKnn6", "EPSG:5179 면적중심 최근접 6개 directed 관계의 대칭 합집합", symmetric_knn_matrix(ordered, 6)),
    ]
    summary_rows: list[dict[str, Any]] = []
    local_csv_rows: list[dict[str, Any]] = []
    payload_rows: list[dict[str, Any]] = []
    for method, neighbor_rule, matrix in specifications:
        global_result = moran_permutation_test(
            ordered["dss_raw"], matrix, permutations=PERMUTATIONS, seed=SEED
        )
        local = local_moran_permutation(
            ordered["dss_raw"], matrix, permutations=PERMUTATIONS, seed=SEED
        )
        local_rows: list[dict[str, Any]] = []
        for index, record in ordered.iterrows():
            result = local.iloc[index]
            local_row = {
                "method": method,
                "code": record["adm_cd2"],
                "dong": record["dong_name"],
                "neighborCount": int(np.count_nonzero(matrix[index])),
                "zScore": float(result["z_score"]),
                "spatialLag": float(result["spatial_lag"]),
                "localMoranI": float(result["local_moran_i"]),
                "quadrant": result["quadrant"],
                "pRaw": float(result["p_raw"]),
                "qFdr": float(result["q_fdr"]),
                "significantFdr05": bool(result["significant_fdr_0_05"]),
            }
            local_rows.append(local_row)
            local_csv_rows.append(local_row)
        significant_hh = ordered_dongs(
            row["dong"]
            for row in local_rows
            if row["significantFdr05"] and row["quadrant"] == "HH"
        )
        significant_ll = ordered_dongs(
            row["dong"]
            for row in local_rows
            if row["significantFdr05"] and row["quadrant"] == "LL"
        )
        summary = {
            "method": method,
            "neighborRule": neighbor_rule,
            "moranI": float(global_result["moran_i"]),
            "expectedI": float(global_result["expected_i_permutation"]),
            "pValue": float(global_result["p_two_sided"]),
            "pUpper": float(global_result["p_upper"]),
            "permutations": PERMUTATIONS,
            "seed": SEED,
            "minNeighborCount": int(matrix.sum(axis=1).min()),
            "maxNeighborCount": int(matrix.sum(axis=1).max()),
            "significantHhDongs": significant_hh,
            "significantLlDongs": significant_ll,
        }
        summary_rows.append(summary)
        payload_rows.append(
            {
                **summary,
                "analysisId": "spatial_weights_sensitivity_v1",
                "formula": (
                    "Global Moran I with row-standardized binary W; conditional local permutation with focal z fixed; "
                    "two-sided deviation around simulation mean; BH-FDR across 44 dongs"
                ),
                "unit": "Moran I·z·spatial lag 무차원; p·q 0~1",
                "limitation": (
                    "공간가중행렬 명세에 대한 진단이며 유의 군집은 서비스 수요·정책효과·우선순위를 뜻하지 않는다. "
                    "centroid kNN은 행정경계 접촉과 다른 이웃 정의다."
                ),
                "localRows": local_rows,
            }
        )
    tables = {
        "05_spatial_weights_global.csv": summary_rows,
        "06_spatial_weights_local.csv": local_csv_rows,
    }
    return payload_rows, tables


def hypergeometric_probability(
    population_size: int, success_states: int, draws: int, overlap: int
) -> float:
    if overlap < 0 or overlap > min(success_states, draws):
        return 0.0
    if draws - overlap > population_size - success_states:
        return 0.0
    return (
        math.comb(success_states, overlap)
        * math.comb(population_size - success_states, draws - overlap)
        / math.comb(population_size, draws)
    )


def compute_overlap_null(area: pd.DataFrame) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    population_size = len(area)
    current_count = int(area["current_drt_flag"].sum())
    draw_count = 3
    top3 = area.nlargest(draw_count, "dss_raw")
    observed_overlap = int(top3["current_drt_flag"].sum())
    max_overlap = min(current_count, draw_count)
    probabilities = [
        hypergeometric_probability(population_size, current_count, draw_count, overlap)
        for overlap in range(max_overlap + 1)
    ]
    distribution = [
        {
            "overlap": overlap,
            "probability": probability,
            "cumulativeAtLeast": sum(probabilities[overlap:]),
        }
        for overlap, probability in enumerate(probabilities)
    ]
    p_at_least_observed = sum(probabilities[observed_overlap:])
    expected = draw_count * current_count / population_size
    formula = "P(X=x)=C(3,x)*C(41,3-x)/C(44,3), X=임의 top3와 기존 팀 매핑 3동의 중첩수"
    limitation = (
        "과거 팀 사후 대리매핑 3동은 독립 정답 타깃이 아니다. 이 정확 기준선은 예측력 검증이 아니라 "
        "관측 중첩 1곳의 우연 가능성을 보여 주는 반증 진단이다."
    )
    payload = {
        "analysisId": "current_drt_hypergeom_null_v1",
        "formula": formula,
        "unit": "동 개수; 확률 0~1",
        "limitation": limitation,
        "populationSize": population_size,
        "candidateCount": draw_count,
        "drawCount": draw_count,
        "currentCount": current_count,
        "observedOverlap": observed_overlap,
        "expectedOverlap": expected,
        "pAtLeastObserved": p_at_least_observed,
        "baselineTop3Dongs": ordered_dongs(top3["dong_name"]),
        "distribution": distribution,
    }
    tables = {"07_overlap_hypergeom_null.csv": distribution}
    return payload, tables


def construct_scenario_row(
    scenario_id: str,
    changed_axis: str,
    specification: str,
    top8: set[str],
    baseline: set[str],
    facility_count: int,
) -> dict[str, Any]:
    return {
        "scenarioId": scenario_id,
        "changedAxis": changed_axis,
        "specification": specification,
        "facilityCount": facility_count,
        "intersectionCount": len(top8 & baseline),
        "jaccardVsBaseline": jaccard(top8, baseline),
        "top8Dongs": ordered_dongs(top8),
        "outDongs": ordered_dongs(baseline - top8),
        "inDongs": ordered_dongs(top8 - baseline),
    }


def compute_construct_sensitivity(
    area: pd.DataFrame, grid: pd.DataFrame, facilities: pd.DataFrame
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    baseline = set(area.loc[area["candidate_top8"], "dong_name"])
    baseline_scores, _ = score_dss(
        area["cag"],
        area["bus_inefficiency_raw"],
        area["facility_dispersion_raw_m"],
        BASE_WEIGHTS,
    )
    baseline_top8, _ = eligible_top8(area, baseline_scores)
    if baseline_top8 != baseline:
        raise ValueError("구성개념 민감도의 기준 시나리오가 후보 8개를 보존하지 못했습니다.")
    scenario_rows = [
        construct_scenario_row(
            "baseline_all_hira",
            "baseline",
            "포스터 수요정의 + 병의원등·약국 동일가중",
            baseline_top8,
            baseline,
            len(facilities),
        )
    ]

    for scenario_id, demand_column, description in (
        (
            "demand_corrected_65plus",
            "demand_index_corrected_65plus",
            "110세 이상 2명을 포함한 65세 이상 교정 수요지수",
        ),
        (
            "demand_without_single70",
            "demand_index_without_single70",
            "70세 이상 1인세대 밀도 구성요소 제외",
        ),
    ):
        cag = zscore(area[demand_column]) - zscore(area["ri_proxy"])
        scores, _ = score_dss(
            cag,
            area["bus_inefficiency_raw"],
            area["facility_dispersion_raw_m"],
            BASE_WEIGHTS,
        )
        top8, _ = eligible_top8(area, scores)
        scenario_rows.append(
            construct_scenario_row(
                scenario_id,
                "demandDefinition",
                description,
                top8,
                baseline,
                len(facilities),
            )
        )

    grid_xy = grid[["x_5179", "y_5179"]].to_numpy(dtype=float)
    for layer, scenario_id, description in (
        ("병의원등", "facility_medical_only", "HIRA 병의원등 1,397개만 동일가중"),
        ("약국", "facility_pharmacy_only", "HIRA 약국 496개만 동일가중"),
    ):
        selected_facilities = facilities.loc[facilities["facility_layer"].eq(layer)]
        access = compute_grid_accessibility(
            grid_xy,
            selected_facilities[["x_5179", "y_5179"]].to_numpy(dtype=float),
            np.ones(len(selected_facilities), dtype=float),
            betas_per_min=(0.10,),
            walking_speed_mps=WALKING_SPEED_MPS,
        )
        grid_layer = grid[["adm_cd2"]].copy()
        grid_layer["ri"] = access["ri_beta_0.1"]
        grid_layer["nearest"] = access["nearest_facility_m"]
        aggregate = grid_layer.groupby("adm_cd2", as_index=False).agg(
            ri=("ri", "mean"), nearest=("nearest", "mean")
        )
        merged = area.merge(aggregate, on="adm_cd2", how="left", validate="one_to_one")
        if merged[["ri", "nearest"]].isna().any().any():
            raise ValueError(f"시설계층 시나리오 집계 누락: {layer}")
        cag = zscore(merged["demand_index"]) - zscore(merged["ri"])
        scores, _ = score_dss(
            cag,
            merged["bus_inefficiency_raw"],
            merged["nearest"],
            BASE_WEIGHTS,
        )
        top8, _ = eligible_top8(merged, scores)
        scenario_rows.append(
            construct_scenario_row(
                scenario_id,
                "facilityLayer",
                description,
                top8,
                baseline,
                len(selected_facilities),
            )
        )

    formula = (
        "한 번에 수요정의 또는 HIRA 시설계층 한 축만 변경하고 beta=.10/min, 버스 구성요소, "
        "DSS 0.5/0.3/0.2, 과거 팀 사후 대리매핑 3동 제외 규칙을 고정"
    )
    limitation = (
        "단일축 명세 견고성으로 상호작용을 검증하지 않는다. 약국과 병의원등은 대체재가 아니며 "
        "어느 시나리오도 실제 62개 돌봄서비스 접근성을 뜻하지 않는다."
    )
    payload = {
        "analysisId": "construct_single_axis_sensitivity_v1",
        "formula": formula,
        "unit": "Jaccard 0~1; 시설 개수; 동 집합",
        "limitation": limitation,
        "baselineScenarioId": "baseline_all_hira",
        "scenarios": scenario_rows,
    }
    return payload, {"08_construct_sensitivity.csv": scenario_rows}


def compute_dss_component_dependence(
    area: pd.DataFrame,
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    component_ids = [component_id for component_id, _, _ in DSS_COMPONENTS]
    component_labels = {
        component_id: label for component_id, label, _ in DSS_COMPONENTS
    }
    component_columns = {
        component_id: column for component_id, _, column in DSS_COMPONENTS
    }
    values = area[[component_columns[component_id] for component_id in component_ids]].astype(float)
    values.columns = component_ids
    pearson = values.corr(method="pearson")
    spearman = values.rank(method="average").corr(method="pearson")

    pair_rows: list[dict[str, Any]] = []
    for left_index, left in enumerate(component_ids):
        for right in component_ids[left_index + 1 :]:
            rho = float(spearman.loc[left, right])
            pair_rows.append(
                {
                    "componentA": left,
                    "componentALabel": component_labels[left],
                    "componentB": right,
                    "componentBLabel": component_labels[right],
                    "nAreas": len(area),
                    "pearsonR": float(pearson.loc[left, right]),
                    "spearmanRho": rho,
                    "highMonotonicDependenceAbsRhoGe08": abs(rho) >= 0.8,
                }
            )

    standardized = np.column_stack([zscore(values[component_id]) for component_id in component_ids])
    vif_rows: list[dict[str, Any]] = []
    for index, component_id in enumerate(component_ids):
        target = standardized[:, index]
        predictors = np.delete(standardized, index, axis=1)
        design = np.column_stack([np.ones(len(predictors)), predictors])
        fitted = design @ np.linalg.lstsq(design, target, rcond=None)[0]
        residual_sum_squares = float(np.square(target - fitted).sum())
        total_sum_squares = float(np.square(target - target.mean()).sum())
        r_squared = 1 - residual_sum_squares / total_sum_squares
        if r_squared >= 1:
            raise ValueError(f"완전 다중공선성으로 VIF를 계산할 수 없습니다: {component_id}")
        vif_rows.append(
            {
                "component": component_id,
                "componentLabel": component_labels[component_id],
                "nAreas": len(area),
                "rSquaredAgainstOtherComponents": r_squared,
                "vif": 1 / (1 - r_squared),
            }
        )

    formula = (
        "Pearson=raw component linear correlation; Spearman=Pearson correlation of average ranks; "
        "VIF_j=1/(1-R2_j), where component j is OLS-regressed on the other two with an intercept"
    )
    limitation = (
        "44개 행정동의 기술적 의존성 진단이며 인과·독립 검증이 아니다. CAG에는 RI 시설접근성이 이미 포함돼 "
        "명시적 의료거리 항과 구조적으로 관련될 수 있다. |Spearman|>=0.8 표시는 경고 기준이지 변수 삭제 규칙이 아니다."
    )
    high_pairs = [
        row for row in pair_rows if row["highMonotonicDependenceAbsRhoGe08"]
    ]
    payload = {
        "analysisId": "dss_component_dependence_v1",
        "formula": formula,
        "unit": "Pearson r·Spearman rho -1~1; R2 0~1; VIF >=1; 행정동 n=44",
        "limitation": limitation,
        "pairRows": pair_rows,
        "vifRows": vif_rows,
        "highMonotonicDependenceThreshold": 0.8,
        "highMonotonicDependencePairs": high_pairs,
    }
    return payload, {
        "09_dss_component_correlations.csv": pair_rows,
        "09a_dss_component_vif.csv": vif_rows,
    }


def compute_dss_component_ablation(
    area: pd.DataFrame,
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    baseline = set(area.loc[area["candidate_top8"], "dong_name"])
    normalized = np.column_stack(
        [
            zscore(area["cag"]),
            zscore(area["bus_inefficiency_raw"]),
            zscore(area["facility_dispersion_raw_m"]),
        ]
    )
    scenario_specs = [
        (
            "baseline",
            "기준 3요소",
            (0.50, 0.30, 0.20),
            "CAG·버스 비효율·명시적 의료거리 항 유지",
        ),
        (
            "remove_bus",
            "버스 항 제거",
            (5 / 7, 0.0, 2 / 7),
            "버스 비효율 가중치 0, 나머지 5:2 비율 재정규화",
        ),
        (
            "remove_explicit_facility",
            "명시적 의료거리 항 제거",
            (5 / 8, 3 / 8, 0.0),
            "의료거리 가중치 0, 나머지 5:3 비율 재정규화; CAG 내부 RI는 유지",
        ),
        (
            "remove_bus_and_explicit_facility",
            "버스·명시적 의료거리 항 동시 제거",
            (1.0, 0.0, 0.0),
            "상위 DSS에는 CAG만 유지; CAG 내부 RI 시설접근성은 유지",
        ),
    ]
    scenario_rows: list[dict[str, Any]] = []
    scenario_sets: dict[str, set[str]] = {}
    ranks_by_dong: dict[str, list[int]] = {
        row.dong_name: []
        for row in area.loc[area["current_drt_flag"].eq(0), ["dong_name"]].itertuples(index=False)
    }
    inclusion_scenarios: dict[str, list[str]] = {dong: [] for dong in ranks_by_dong}

    for scenario_id, label, weights, description in scenario_specs:
        top8, eligible = eligible_top8(area, normalized @ np.asarray(weights, dtype=float))
        scenario_sets[scenario_id] = top8
        for row in eligible.itertuples(index=False):
            ranks_by_dong[row.dong_name].append(int(row.rank))
            if row.dong_name in top8:
                inclusion_scenarios[row.dong_name].append(scenario_id)
        intersection = len(top8 & baseline)
        scenario_rows.append(
            {
                "scenarioId": scenario_id,
                "scenarioLabel": label,
                "description": description,
                "weightCag": weights[0],
                "weightBus": weights[1],
                "weightExplicitFacility": weights[2],
                "intersectionCount": intersection,
                "jaccardVsBaseline": jaccard(top8, baseline),
                "top8Dongs": ordered_dongs(top8),
                "outDongs": ordered_dongs(baseline - top8),
                "inDongs": ordered_dongs(top8 - baseline),
            }
        )

    stable_core = set.intersection(*scenario_sets.values())
    union = set.union(*scenario_sets.values())
    conditional_baseline = baseline - stable_core
    alternatives = union - baseline
    area_rows: list[dict[str, Any]] = []
    eligible_area = area.loc[
        area["current_drt_flag"].eq(0), ["adm_cd2", "dong_name", "candidate_top8"]
    ].sort_values("adm_cd2")
    for row in eligible_area.itertuples(index=False):
        if row.dong_name in stable_core:
            stability_class = "stable_core"
        elif row.dong_name in conditional_baseline:
            stability_class = "conditional_baseline"
        elif row.dong_name in alternatives:
            stability_class = "alternative_entry"
        else:
            stability_class = "never_top8"
        dong_ranks = ranks_by_dong[row.dong_name]
        area_rows.append(
            {
                "code": row.adm_cd2,
                "dong": row.dong_name,
                "baselineCandidate": bool(row.candidate_top8),
                "inclusionCount": len(inclusion_scenarios[row.dong_name]),
                "inclusionShare": len(inclusion_scenarios[row.dong_name]) / len(scenario_specs),
                "includedScenarioIds": inclusion_scenarios[row.dong_name],
                "minRank": min(dong_ranks),
                "medianRank": float(np.median(dong_ranks)),
                "maxRank": max(dong_ranks),
                "stabilityClass": stability_class,
            }
        )

    formula = (
        "44동에서 z(CAG), z(bus inefficiency), z(explicit facility distance)를 고정하고; "
        "제거 항의 가중치를 0으로 만든 뒤 남은 기준가중치 비율을 합계 1로 재정규화; 과거 팀 사후 대리매핑 3동은 top8에서 제외"
    )
    limitation = (
        "상위 DSS 항의 기술적 ablation이며 인과효과·최적 명세를 뜻하지 않는다. 특히 CAG=demand-RI라서 "
        "명시적 의료거리 항을 제거해도 CAG 내부 시설접근성 RI는 남는다. 4개 명세 포함수는 선정확률이 아니다."
    )
    payload = {
        "analysisId": "dss_top_level_component_ablation_v1",
        "formula": formula,
        "unit": "가중치 0~1; Jaccard 0~1; 포함수 0~4; 순위 1~41; 동 집합",
        "limitation": limitation,
        "scenarioCount": len(scenario_specs),
        "scenarios": scenario_rows,
        "stableCoreDongs": ordered_dongs(stable_core),
        "conditionalBaselineDongs": ordered_dongs(conditional_baseline),
        "alternativeEntryDongs": ordered_dongs(alternatives),
        "areaRows": area_rows,
    }
    return payload, {
        "10_dss_ablation_scenarios.csv": scenario_rows,
        "11_dss_ablation_area_stability.csv": area_rows,
    }


def parse_bus_route_mentions(bus_stops: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    malformed: list[str] = []
    for stop in bus_stops.itertuples(index=False):
        for token in str(stop.routes_raw).split(","):
            match = ROUTE_TOKEN_PATTERN.match(token)
            if not match or not match.group(1).strip() or not match.group(2).strip():
                malformed.append(token)
                continue
            rows.append(
                {
                    "code": stop.adm_cd2 if pd.notna(stop.adm_cd2) else "",
                    "dong": stop.dong_name if pd.notna(stop.dong_name) else "",
                    "stopId": str(stop.stop_id),
                    "routeName": match.group(1).strip(),
                    "routeType": match.group(2).strip(),
                    "spatialJoinStatus": stop.spatial_join_status,
                }
            )
    if malformed:
        raise ValueError(f"경유노선 문자열 파싱 실패 {len(malformed)}건")
    mentions = pd.DataFrame(rows)
    if len(mentions) != int(bus_stops["route_count"].sum()):
        raise ValueError("파싱한 경유노선 표기 수와 원본 route_count 합계가 다릅니다.")
    if mentions.duplicated(["stopId", "routeType", "routeName"]).any():
        raise ValueError("같은 정류장에 동일 유형·노선 표기가 중복돼 있습니다.")
    expected_types = {"마을", "서울", "시내", "시외"}
    actual_types = set(mentions["routeType"])
    if actual_types != expected_types:
        raise ValueError(f"예상하지 못한 노선유형: {sorted(actual_types)}")
    return mentions


def compute_village_bus_screening(
    area: pd.DataFrame,
    bus_stops: pd.DataFrame,
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    mentions = parse_bus_route_mentions(bus_stops)
    inside_stops = bus_stops.loc[bus_stops["spatial_join_status"].eq("inside")].copy()
    inside_mentions = mentions.loc[mentions["spatialJoinStatus"].eq("inside")].copy()
    village_mentions = inside_mentions.loc[
        inside_mentions["routeType"].eq(VILLAGE_ROUTE_TYPE)
    ].copy()

    area_lookup = area.set_index("adm_cd2")
    area_rows: list[dict[str, Any]] = []
    for code, row in area_lookup.sort_index().iterrows():
        stop_subset = inside_stops.loc[inside_stops["adm_cd2"].eq(code)]
        mention_subset = inside_mentions.loc[inside_mentions["code"].eq(code)]
        village_subset = village_mentions.loc[village_mentions["code"].eq(code)]
        stop_count = len(stop_subset)
        route_mention_count = len(mention_subset)
        if stop_count == 0 or route_mention_count == 0:
            raise ValueError(f"정류장 또는 노선 표기가 없는 행정동: {row['dong_name']}")
        village_stop_count = int(village_subset["stopId"].nunique())
        village_mention_count = len(village_subset)
        village_routes = sorted(village_subset["routeName"].unique())
        area_rows.append(
            {
                "code": code,
                "district": row["district_name"],
                "dong": row["dong_name"],
                "baselineCandidate": bool(row["candidate_top8"]),
                "allStopCount": stop_count,
                "villageServingStopCount": village_stop_count,
                "villageServingStopShare": village_stop_count / stop_count,
                "allRouteMentionCount": route_mention_count,
                "villageRouteMentionCount": village_mention_count,
                "villageRouteMentionShare": village_mention_count / route_mention_count,
                "uniqueAllRouteCount": int(
                    mention_subset[["routeType", "routeName"]].drop_duplicates().shape[0]
                ),
                "uniqueVillageRouteCount": len(village_routes),
                "villageRouteNames": village_routes,
            }
        )

    area_frame = pd.DataFrame(area_rows)
    if len(area_frame) != 44 or area_frame["code"].nunique() != 44:
        raise ValueError("마을버스 스크리닝은 44동을 1회씩 포함해야 합니다.")
    area_frame["villageServingStopShareAscendingRank"] = (
        area_frame["villageServingStopShare"].rank(method="min", ascending=True).astype(int)
    )
    area_frame["uniqueVillageRouteCountAscendingRank"] = (
        area_frame["uniqueVillageRouteCount"].rank(method="min", ascending=True).astype(int)
    )
    stop_share_median = float(area_frame["villageServingStopShare"].median())
    unique_route_median = float(area_frame["uniqueVillageRouteCount"].median())
    area_frame["belowCityAreaMedianVillageStopShare"] = (
        area_frame["villageServingStopShare"] < stop_share_median
    )
    area_frame["belowCityAreaMedianUniqueVillageRoutes"] = (
        area_frame["uniqueVillageRouteCount"] < unique_route_median
    )
    area_rows = [builtin(row) for row in area_frame.to_dict(orient="records")]

    route_presence_frame = (
        village_mentions.groupby(["code", "dong", "routeName"], as_index=False)
        .agg(servingStopCount=("stopId", "nunique"), routeMentionCount=("stopId", "size"))
        .sort_values(["code", "routeName"])
    )
    route_presence_rows = [builtin(row) for row in route_presence_frame.to_dict(orient="records")]
    route_type_counts = (
        inside_mentions.groupby("routeType").size().sort_index().astype(int).to_dict()
    )
    village_serving_stop_count = int(village_mentions["stopId"].nunique())
    formula = (
        "routes_raw를 comma로 분리하고 '노선명(유형)'을 파싱; 유형='마을' 표기를 추출; "
        "동별 마을정류장비율=마을노선 1개 이상 표기 정류장/전체 경계내 정류장; "
        "고유 마을노선=동별 routeName distinct count"
    )
    limitation = (
        "2025-08-25 정류장 CSV의 정적 노선 존재 표기만 쓴 1차 스크리닝이다. 배차·운행횟수·방향·시간대·환승·OD·"
        "보행권·노선변경을 알 수 없으므로 공급량·접근성·서비스 품질·도입 우선순위로 해석하지 않는다. 순위는 낮은 값 탐색용이다."
    )
    payload = {
        "analysisId": "village_bus_static_presence_screen_v1",
        "formula": formula,
        "unit": "정류장 개소; 노선표기 건; 고유 노선명 개; 비율 0~1; 낮은값 순위 1~44",
        "limitation": limitation,
        "sourceDate": SOURCE_DATES["busStops"],
        "rawStopCount": len(bus_stops),
        "insideStopCount": len(inside_stops),
        "excludedOutsideStopCount": int(len(bus_stops) - len(inside_stops)),
        "rawRouteMentionCount": len(mentions),
        "insideRouteMentionCount": len(inside_mentions),
        "insideRouteTypeMentionCounts": route_type_counts,
        "villageServingStopCount": village_serving_stop_count,
        "villageServingStopShare": village_serving_stop_count / len(inside_stops),
        "villageRouteMentionCount": len(village_mentions),
        "villageRouteMentionShare": len(village_mentions) / len(inside_mentions),
        "uniqueVillageRouteCount": int(village_mentions["routeName"].nunique()),
        "areaMedianVillageServingStopShare": stop_share_median,
        "areaMedianUniqueVillageRouteCount": unique_route_median,
        "areaRows": area_rows,
        "routePresenceRows": route_presence_rows,
    }
    return payload, {
        "13_village_bus_area_screening.csv": area_rows,
        "14_village_bus_route_presence.csv": route_presence_rows,
    }


def compute_focus_area_comparison(
    area: pd.DataFrame,
    village_bus: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    area_lookup = area.set_index("dong_name")
    village_lookup = {row["dong"]: row for row in village_bus["areaRows"]}
    if not set(FOCUS_DONGS).issubset(area_lookup.index) or not set(FOCUS_DONGS).issubset(village_lookup):
        raise ValueError("관산·행주·대화 비교 입력이 완전하지 않습니다.")
    rows: list[dict[str, Any]] = []
    for dong in FOCUS_DONGS:
        source = area_lookup.loc[dong]
        bus = village_lookup[dong]
        rows.append(
            {
                "dong": dong,
                "district": source["district_name"],
                "baselineCandidate": bool(source["candidate_top8"]),
                "currentDrtMapped": bool(source["current_drt_flag"]),
                "population": int(source["population"]),
                "elderly65Count": int(source["elderly65_109"]),
                "agingRate": float(source["aging_rate"]),
                "single70Count": int(source["single70"]),
                "demandIndex": float(source["demand_index"]),
                "cag": float(source["cag"]),
                "allStopCount": int(bus["allStopCount"]),
                "routesPerStop": float(source["routes_per_stop"]),
                "allRouteMentionCount": int(bus["allRouteMentionCount"]),
                "villageServingStopCount": int(bus["villageServingStopCount"]),
                "villageServingStopShare": float(bus["villageServingStopShare"]),
                "uniqueVillageRouteCount": int(bus["uniqueVillageRouteCount"]),
                "villageRouteMentionCount": int(bus["villageRouteMentionCount"]),
                "villageRouteMentionShare": float(bus["villageRouteMentionShare"]),
                "villageRouteNames": bus["villageRouteNames"],
                "meanNearestFacilityM": float(source["nearest_facility_mean_m"]),
                "dssRaw": float(source["dss_raw"]),
                "dssDisplay01": float(source["dss_01"]),
                "globalRank": int(source["rank_global"]),
                "eligibleRank": int(source["rank_eligible"]),
            }
        )
    formula = (
        "재현분석 area_scores의 동일 필드와 2025-08-25 정류장 CSV 마을노선 존재 스크리닝을 동명으로 결합; "
        "계산식은 각 원 분석과 village_bus_static_presence_screen_v1을 따름"
    )
    limitation = (
        "세 동의 기술 비교표이며 표본선정·인과검증이 아니다. 대화동은 비후보 설명용 비교 동이지 통계적 대조군이 아니며, "
        "마을노선 수·정류장 비율은 배차나 실제 돌봄 접근성을 뜻하지 않는다."
    )
    payload = {
        "analysisId": "focus_area_gwansan_haengju_daehwa_v1",
        "formula": formula,
        "unit": "명; 비율 0~1; 정류장 개소; 고유 노선명 개; 노선표기 건; 거리 m; 순위 1~44/41",
        "limitation": limitation,
        "dongs": FOCUS_DONGS,
        "rows": rows,
    }
    return payload, {"12_focus_area_comparison.csv": rows}


def builtin(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): builtin(child) for key, child in value.items()}
    if isinstance(value, (list, tuple)):
        return [builtin(child) for child in value]
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        numeric = float(value)
        if not math.isfinite(numeric):
            raise ValueError("산출물에 비유한 숫자가 포함됐습니다.")
        return numeric
    if pd.isna(value):
        return None
    return value


def csv_value(value: Any) -> Any:
    value = builtin(value)
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        return format(value, ".15g")
    return value


def write_analysis_csv(
    filename: str,
    rows: list[dict[str, Any]],
    *,
    analysis_id: str,
    unit: str,
    formula: str,
    limitation: str,
    input_hashes: str,
    raw_hashes: str,
) -> None:
    if not rows:
        raise ValueError(f"빈 CSV는 만들지 않습니다: {filename}")
    path = OUTPUT_TABLE_DIR / filename
    common = {
        "artifact_schema_version": (
            SCHEMA_VERSION if filename in ACCESS_TIME_TABLE_FILES else LEGACY_CSV_SCHEMA_VERSION
        ),
        "analysis_id": analysis_id,
        "snapshot_id": SNAPSHOT_ID,
        "source_dates": source_dates_string(),
        "unit_definition": unit,
        "formula": formula,
        "limitation": limitation,
        "input_sha256": input_hashes,
        "raw_source_sha256": raw_hashes,
    }
    fieldnames = list(rows[0].keys()) + COMMON_CSV_COLUMNS
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            if list(row.keys()) != list(rows[0].keys()):
                raise ValueError(f"CSV 행 스키마가 일정하지 않습니다: {filename}")
            writer.writerow({key: csv_value(value) for key, value in {**row, **common}.items()})


def write_input_manifest_csv(
    input_manifest: list[dict[str, Any]], raw_manifest: list[dict[str, Any]]
) -> None:
    rows = [
        {
            "manifestKind": "processed_input",
            **row,
            "snapshotDate": "mixed",
        }
        for row in input_manifest
    ] + [
        {
            "manifestKind": "raw_source",
            "inputId": row["sourceId"],
            "role": "원자료 SHA 계보",
            "relativePath": "source_manifest.csv에 기록",
            "bytes": "",
            "sha256": row["sha256"],
            "snapshotDate": row["snapshotDate"],
        }
        for row in raw_manifest
    ]
    write_analysis_csv(
        "00_input_manifest.csv",
        rows,
        analysis_id="input_lineage_v1",
        unit="bytes; SHA-256 hex; date YYYY-MM-DD",
        formula="SHA-256(input file bytes); raw hashes inherited from verified source_manifest.csv",
        limitation="처리 산출물 해시는 원자료 의미 타당성이나 외부 최신성을 대신하지 않는다.",
        input_hashes=manifest_hash_string(input_manifest),
        raw_hashes=raw_hash_string(raw_manifest),
    )


def run_id(input_manifest: list[dict[str, Any]]) -> str:
    specification = {
        "schema": SCHEMA_VERSION,
        "seed": SEED,
        "permutations": PERMUTATIONS,
        "weights": BASE_WEIGHTS,
        "boundedWeightSimplex": {
            "cag": (0.30, 0.70),
            "bus": (0.15, 0.50),
            "facility": (0.10, 0.40),
            "step": 0.05,
        },
        "boundaryAuditSimplex": {"componentBounds": (0.0, 1.0), "step": 0.05},
        "thresholdMinutes": THRESHOLD_MINUTES,
        "accessTimeScenario": {
            "coverageThresholdMinutes": ACCESS_TIME_THRESHOLDS_MIN,
            "waitMinutes": DRT_WAIT_SCENARIOS_MIN,
            "fixedAccessEgressMinutes": DRT_FIXED_ACCESS_EGRESS_MIN,
            "networkDistanceFactor": DRT_NETWORK_DISTANCE_FACTOR,
            "inVehicleSpeedKmh": DRT_IN_VEHICLE_SPEED_KMH,
            "assumedTransfers": 0,
        },
        "dssAblation": [
            (0.50, 0.30, 0.20),
            (5 / 7, 0.0, 2 / 7),
            (5 / 8, 3 / 8, 0.0),
            (1.0, 0.0, 0.0),
        ],
        "villageRouteType": VILLAGE_ROUTE_TYPE,
        "focusDongs": FOCUS_DONGS,
        "inputHashes": manifest_hash_string(input_manifest),
    }
    encoded = json.dumps(specification, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest().upper()[:20]


def render_ablation_figure(payload: dict[str, Any]) -> str:
    analysis = payload["dssAblation"]
    rows: list[str] = []
    for index, scenario in enumerate(analysis["scenarios"]):
        y = 142 + index * 78
        width = 620 * float(scenario["jaccardVsBaseline"])
        label = html.escape(str(scenario["scenarioLabel"]))
        out_text = html.escape(", ".join(scenario["outDongs"]) or "없음")
        in_text = html.escape(", ".join(scenario["inDongs"]) or "없음")
        rows.append(
            f'<text x="42" y="{y}" class="label">{label}</text>'
            f'<rect x="300" y="{y - 24}" width="620" height="28" rx="7" fill="#E8EEF7"/>'
            f'<rect x="300" y="{y - 24}" width="{width:.3f}" height="28" rx="7" fill="#3558D4"/>'
            f'<text x="936" y="{y - 4}" class="value">Jaccard {scenario["jaccardVsBaseline"]:.3f}</text>'
            f'<text x="300" y="{y + 26}" class="note">이탈: {out_text} · 진입: {in_text}</text>'
        )
    core = html.escape(", ".join(analysis["stableCoreDongs"]))
    conditional = html.escape(", ".join(analysis["conditionalBaselineDongs"]))
    limitation = html.escape(analysis["limitation"])
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="570" viewBox="0 0 1200 570" role="img" aria-labelledby="title desc">
<title id="title">DSS 상위 구성요소 제거 시 기준 Top8 교체</title>
<desc id="desc">{limitation}</desc>
<style>
text{{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;fill:#15213A}} .title{{font-size:27px;font-weight:700}} .subtitle{{font-size:15px;fill:#526079}} .label{{font-size:16px;font-weight:700}} .value{{font-size:15px;font-weight:700}} .note{{font-size:13px;fill:#526079}} .footer{{font-size:14px;fill:#283754}}
</style>
<rect width="1200" height="570" fill="#FFFFFF"/>
<text id="title-text" x="42" y="47" class="title">DSS 상위 구성요소 ablation: Top8은 얼마나 바뀌는가</text>
<text x="42" y="76" class="subtitle">44동 z표준화 · 과거 팀 사후 대리매핑 3동 제외 · 남은 기준가중치 비율 재정규화 · 포함수는 확률이 아님</text>
{''.join(rows)}
<line x1="42" y1="466" x2="1158" y2="466" stroke="#D7DEEA"/>
<text x="42" y="496" class="footer">4/4 안정핵심: {core}</text>
<text x="42" y="523" class="footer">조건부 기준후보: {conditional}</text>
<text x="42" y="550" class="note">주의: 명시적 의료거리 항을 제거해도 CAG 내부 RI 시설접근성은 남는다.</text>
</svg>'''


def render_focus_village_bus_figure(payload: dict[str, Any]) -> str:
    focus = payload["focusComparison"]
    rows: list[str] = []
    for index, row in enumerate(focus["rows"]):
        y = 158 + index * 105
        width = 650 * float(row["villageServingStopShare"])
        color = "#3558D4" if row["baselineCandidate"] else "#77849A"
        dong = html.escape(row["dong"])
        candidate = "기준후보" if row["baselineCandidate"] else "비후보 비교"
        route_names = html.escape(", ".join(row["villageRouteNames"]))
        rows.append(
            f'<text x="42" y="{y}" class="label">{dong}</text>'
            f'<text x="137" y="{y}" class="badge">{candidate}</text>'
            f'<rect x="300" y="{y - 23}" width="650" height="30" rx="8" fill="#E8EEF7"/>'
            f'<rect x="300" y="{y - 23}" width="{width:.3f}" height="30" rx="8" fill="{color}"/>'
            f'<text x="968" y="{y}" class="value">{row["villageServingStopShare"] * 100:.2f}% · {row["villageServingStopCount"]}/{row["allStopCount"]}개소</text>'
            f'<text x="300" y="{y + 30}" class="note">고유 마을노선 {row["uniqueVillageRouteCount"]}개: {route_names}</text>'
        )
    limitation = html.escape(focus["limitation"])
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="525" viewBox="0 0 1200 525" role="img" aria-labelledby="title desc">
<title id="title">관산동 행주동 대화동 마을버스 정적 존재 비교</title>
<desc id="desc">{limitation}</desc>
<style>
text{{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;fill:#15213A}} .title{{font-size:27px;font-weight:700}} .subtitle{{font-size:15px;fill:#526079}} .label{{font-size:19px;font-weight:700}} .badge{{font-size:13px;fill:#526079}} .value{{font-size:15px;font-weight:700}} .note{{font-size:13px;fill:#526079}} .footer{{font-size:13px;fill:#7B3F32}}
</style>
<rect width="1200" height="525" fill="#FFFFFF"/>
<text x="42" y="47" class="title">관산·행주·대화: 마을노선 표기 정류장 비율</text>
<text x="42" y="76" class="subtitle">기준일 2025-08-25 · 경계 내 정류장 · 정적 노선 존재 1차 스크리닝</text>
<text x="300" y="112" class="note">0%</text><text x="930" y="112" class="note">100%</text>
{''.join(rows)}
<line x1="42" y1="468" x2="1158" y2="468" stroke="#D7DEEA"/>
<text x="42" y="500" class="footer">배차·운행횟수·시간대·방향·환승·OD를 반영하지 않으므로 공급량 또는 정책 우선순위가 아니다.</text>
</svg>'''


def render_access_time_scenario_figure(payload: dict[str, Any]) -> str:
    analysis = payload["accessibilityTimeScenarios"]
    coverage_x0, coverage_width = 275.0, 425.0
    time_x0, time_width, time_max = 850.0, 425.0, 120.0
    rows: list[str] = []
    for index, row in enumerate(analysis["candidateRangeRows"]):
        y = 165 + index * 68
        dong = html.escape(str(row["dong"]))
        reference_coverage_x = coverage_x0 + coverage_width * float(row["referenceCoverage30"])
        scenario_coverage_low_x = coverage_x0 + coverage_width * float(row["scenarioCoverage30Low"])
        scenario_coverage_high_x = coverage_x0 + coverage_width * float(row["scenarioCoverage30High"])
        reference_time_x = time_x0 + time_width * min(
            float(row["referenceMedianMinutes"]) / time_max, 1.0
        )
        scenario_time_low_x = time_x0 + time_width * min(
            float(row["scenarioMedianMinutesLow"]) / time_max, 1.0
        )
        scenario_time_high_x = time_x0 + time_width * min(
            float(row["scenarioMedianMinutesHigh"]) / time_max, 1.0
        )
        rows.append(
            f'<text x="42" y="{y + 5}" class="label">{dong}</text>'
            f'<line x1="{coverage_x0:.1f}" y1="{y}" x2="{coverage_x0 + coverage_width:.1f}" y2="{y}" class="guide"/>'
            f'<line x1="{scenario_coverage_low_x:.3f}" y1="{y}" x2="{scenario_coverage_high_x:.3f}" y2="{y}" class="range"/>'
            f'<circle cx="{scenario_coverage_low_x:.3f}" cy="{y}" r="5" class="range-dot"/>'
            f'<circle cx="{scenario_coverage_high_x:.3f}" cy="{y}" r="5" class="range-dot"/>'
            f'<circle cx="{reference_coverage_x:.3f}" cy="{y}" r="6" class="reference-dot"/>'
            f'<text x="710" y="{y + 5}" class="value">{row["scenarioCoverage30Low"] * 100:.1f}–{row["scenarioCoverage30High"] * 100:.1f}%</text>'
            f'<line x1="{time_x0:.1f}" y1="{y}" x2="{time_x0 + time_width:.1f}" y2="{y}" class="guide"/>'
            f'<line x1="{scenario_time_low_x:.3f}" y1="{y}" x2="{scenario_time_high_x:.3f}" y2="{y}" class="range"/>'
            f'<circle cx="{scenario_time_low_x:.3f}" cy="{y}" r="5" class="range-dot"/>'
            f'<circle cx="{scenario_time_high_x:.3f}" cy="{y}" r="5" class="range-dot"/>'
            f'<circle cx="{reference_time_x:.3f}" cy="{y}" r="6" class="reference-dot"/>'
            f'<text x="1285" y="{y + 5}" class="value">{row["scenarioMedianMinutesLow"]:.1f}–{row["scenarioMedianMinutesHigh"]:.1f}분</text>'
        )
    limitation = html.escape(str(analysis["limitation"]))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="780" viewBox="0 0 1400 780" role="img" aria-labelledby="title desc">
<title id="title">후보 8동 의료시설 이동시간 가정 시나리오 범위</title>
<desc id="desc">{limitation}</desc>
<style>
text{{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;fill:#15213A}} .title{{font-size:27px;font-weight:700}} .subtitle{{font-size:15px;fill:#526079}} .panel{{font-size:16px;font-weight:700}} .label{{font-size:16px;font-weight:700}} .value{{font-size:13px;fill:#526079}} .axis{{font-size:12px;fill:#6A778D}} .note{{font-size:13px;fill:#7B3F32}} .guide{{stroke:#E5EAF1;stroke-width:2}} .range{{stroke:#008C86;stroke-width:7;stroke-linecap:round}} .range-dot{{fill:#008C86}} .reference-dot{{fill:#F47A21;stroke:#FFFFFF;stroke-width:2}}
</style>
<rect width="1400" height="780" fill="#FFFFFF"/>
<text x="42" y="45" class="title">의료시설 도달 가능성: 보행대리 기준과 가정 DRT 범위</text>
<text x="42" y="73" class="subtitle">100m 면적격자 · 대기 5·10·15분 · 접근·승하차 5분 · 거리계수 1.3 · 차내 15km/h · 환승 0회 가정</text>
<circle cx="42" cy="105" r="6" class="reference-dot"/><text x="56" y="110" class="axis">보행 직선거리 기준</text>
<line x1="205" y1="105" x2="249" y2="105" class="range"/><text x="260" y="110" class="axis">세 대기시간 시나리오 최솟값–최댓값</text>
<text x="275" y="135" class="panel">30분 안 면적커버리지</text>
<text x="850" y="135" class="panel">동별 중앙 이동시간</text>
<text x="275" y="151" class="axis">0%</text><text x="478" y="151" class="axis">50%</text><text x="677" y="151" class="axis">100%</text>
<text x="850" y="151" class="axis">0분</text><text x="1055" y="151" class="axis">60분</text><text x="1243" y="151" class="axis">120분</text>
{''.join(rows)}
<line x1="42" y1="716" x2="1358" y2="716" stroke="#D7DEEA"/>
<text x="42" y="741" class="note">실제 도입 전후가 아니다. HIRA 최근접 시설·면적격자·분석자 가정으로 만든 비교 시나리오이며 62개 돌봄서비스와 대상자 도달률을 뜻하지 않는다.</text>
<text x="42" y="763" class="note">범위는 대기시간 한 축만 바꾼 값으로, 신뢰구간·운영효과·DRT 도입 성과가 아니다.</text>
</svg>'''


def write_figures(payload: dict[str, Any]) -> None:
    OUTPUT_FIGURE_DIR.mkdir(parents=True, exist_ok=True)
    figures = {
        "01_dss_ablation_top8.svg": render_ablation_figure(payload),
        "02_focus_area_village_bus.svg": render_focus_village_bus_figure(payload),
        "03_access_time_scenario.svg": render_access_time_scenario_figure(payload),
    }
    for filename, source in figures.items():
        (OUTPUT_FIGURE_DIR / filename).write_text(source, encoding="utf-8", newline="\n")


def render_report(
    payload: dict[str, Any],
    input_manifest: list[dict[str, Any]],
    raw_manifest: list[dict[str, Any]],
) -> str:
    weight = payload["weightSensitivity"]
    boundary = weight["boundaryAudit"]
    coverage = payload["facilityCoverage"]
    overlap = payload["overlapNull"]
    construct = payload["constructSensitivity"]
    spatial = payload["spatialWeights"]
    dependence = payload["dssComponentDependence"]
    ablation = payload["dssAblation"]
    focus = payload["focusComparison"]
    village = payload["villageBusScreening"]
    access = payload["accessibilityTimeScenarios"]
    candidate_counts = {
        row["dong"]: row["count"]
        for row in weight["inclusionRows"]
        if row["baselineCandidate"]
    }
    boundary_candidate_counts = {
        row["dong"]: row["count"]
        for row in boundary["inclusionRows"]
        if row["baselineCandidate"]
    }
    input_lines = "\n".join(
        f"| {row['inputId']} | `{row['relativePath']}` | {row['bytes']:,} | `{row['sha256']}` |"
        for row in input_manifest
    )
    raw_lines = "\n".join(
        f"| {row['sourceId']} | {row['snapshotDate']} | `{row['sha256']}` | {row['status']} |"
        for row in raw_manifest
    )
    spatial_lines = "\n".join(
        "| {method} | {moran:.6f} | {p:.4f} | {hh} | {ll} |".format(
            method=row["method"],
            moran=row["moranI"],
            p=row["pValue"],
            hh=", ".join(row["significantHhDongs"]) or "없음",
            ll=", ".join(row["significantLlDongs"]) or "없음",
        )
        for row in spatial
    )
    construct_lines = "\n".join(
        f"| {row['scenarioId']} | {row['changedAxis']} | {row['jaccardVsBaseline']:.3f} | "
        f"{', '.join(row['outDongs']) or '없음'} | {', '.join(row['inDongs']) or '없음'} |"
        for row in construct["scenarios"]
    )
    dependence_lines = "\n".join(
        f"| {row['componentALabel']} | {row['componentBLabel']} | {row['pearsonR']:.6f} | "
        f"{row['spearmanRho']:.6f} | {'경고' if row['highMonotonicDependenceAbsRhoGe08'] else '해당 없음'} |"
        for row in dependence["pairRows"]
    )
    vif_lines = "\n".join(
        f"| {row['componentLabel']} | {row['rSquaredAgainstOtherComponents']:.6f} | {row['vif']:.6f} |"
        for row in dependence["vifRows"]
    )
    ablation_lines = "\n".join(
        f"| {row['scenarioLabel']} | {row['weightCag']:.6f} | {row['weightBus']:.6f} | "
        f"{row['weightExplicitFacility']:.6f} | {row['jaccardVsBaseline']:.6f} | "
        f"{', '.join(row['outDongs']) or '없음'} | {', '.join(row['inDongs']) or '없음'} |"
        for row in ablation["scenarios"]
    )
    focus_lines = "\n".join(
        f"| {row['dong']} | {'예' if row['baselineCandidate'] else '아니오'} | {row['agingRate'] * 100:.1f}% | "
        f"{row['single70Count']:,} | {row['cag']:.3f} | {row['routesPerStop']:.2f} | "
        f"{row['meanNearestFacilityM'] / 1000:.2f}km | {row['villageServingStopCount']}/{row['allStopCount']} "
        f"({row['villageServingStopShare'] * 100:.2f}%) | {row['uniqueVillageRouteCount']} | {row['globalRank']} |"
        for row in focus["rows"]
    )
    access_lines = "\n".join(
        f"| {row['dong']} | {row['gridCount']:,} | {row['referenceCoverage30'] * 100:.1f}% | "
        f"{row['scenarioCoverage30Low'] * 100:.1f}~{row['scenarioCoverage30High'] * 100:.1f}% | "
        f"{row['coverage30ChangePercentagePointsLow']:+.1f}~{row['coverage30ChangePercentagePointsHigh']:+.1f}%p | "
        f"{row['referenceMedianMinutes']:.1f}분 | "
        f"{row['scenarioMedianMinutesLow']:.1f}~{row['scenarioMedianMinutesHigh']:.1f}분 | "
        f"{row['medianTimeChangeMinutesLow']:+.1f}~{row['medianTimeChangeMinutesHigh']:+.1f}분 | "
        f"{row['breakEvenWaitMedianMinutes']:.1f}분 |"
        for row in access["candidateRangeRows"]
    )
    candidate_count_text = ", ".join(
        f"{dong} {candidate_counts[dong]}/45" for dong in CANDIDATE_DONGS
    )
    boundary_candidate_count_text = ", ".join(
        f"{dong} {boundary_candidate_counts[dong]}/231" for dong in CANDIDATE_DONGS
    )
    return f"""---
id: validation-goyang-professional-analysis-v1
type: analysis-method
status: generated
owner: Suya020504
created: {ARTIFACT_DATE}
updated: {ARTIFACT_DATE}
publish: false
validation_status: deterministic-local
tags:
  - data-analysis
  - robustness
  - spatial-statistics
  - reproducibility
---

# 고양시 정책대시보드 전문 분석 진단 명세

## 1. 목적과 의사결정 질문

기준 대리모형 `{MODEL_ID}`과 후보 8개 집합은 바꾸지 않는다. 이 분석은 **후보 8개가 어떤 명세에서 유지되는지, 추상 지표를 어떤 현장확인 질문으로 바꿀지, 기존 공간·백테스트 주장의 반증 조건이 무엇인지** 확인한다.

- 기준 후보: {', '.join(CANDIDATE_DONGS)}
- 분석 단위: 고양시 44개 행정동, 후보선정 가능 집합 41개 동(과거 팀 사후 대리매핑 3동 제외)
- 타깃: 독립적인 예측 타깃 없음. `candidate_top8`은 기준모형 산출값, `current_drt_flag`는 정책 사후 팀 매핑이다.
- ID: `adm_cd2`는 결합·추적에만 사용하며 점수 입력에 넣지 않는다.

## 2. 데이터 품질·기간·단위

- 행안부 인구·1인세대: 2026-06-30
- HIRA 병의원등·약국: 2026-06-30, 1,893개
- 버스정류장: 2025-08-25
- 분석 행정경계: 2026-04-01
- 데이터 사전: `../../2026-08-09_재현분석/outputs/tables/data_dictionary.csv`
- 100m 면적격자: {access['dataQuality']['gridRowCount']:,}개, 후보 8동 {access['dataQuality']['candidateGridCount']:,}개
- 시간 시나리오 필수필드 결측 {access['dataQuality']['requiredFieldMissingCount']}건, 행정동·좌표 중복 {access['dataQuality']['duplicateGridCoordinateCount']}건, 음수거리 {access['dataQuality']['negativeDistanceCount']}건
- 최근접거리 P99 {access['dataQuality']['distanceP99M']:.1f}m·최대 {access['dataQuality']['distanceMaxM']:.1f}m는 이상치로 임의 삭제하지 않고 원값을 보존했다.
- 플래그 분포: 기준후보 8동 / 비후보 36동, 현행 DRT 사후매핑 3동 / 기타 41동. 독립 예측 타깃은 없다.
- `adm_cd2`는 결합·추적에만 사용했다. `current_drt_flag`, 후보 점수·순위는 이동시간 식에서 제외해 사후정보 누수를 막았다.
- 지도학습 문제가 아니므로 베이스라인·개선모델 성능 비교는 적용하지 않는다. 대신 동일 격자의 보행대리 기준과 대기시간 3개 가정 시나리오를 비교한다.
- 혼합시점이므로 2026년 동시점 접근성이나 실제 고양온돌 대상자의 이동으로 해석하지 않는다.

## 3. 분석 1 — 명시한 제한 범위 가중치 진단과 경계감사

```text
DSS(w) = w_cag*z(CAG) + w_bus*z(버스비효율) + w_facility*z(의료시설 평균 최근접거리)
w_cag 0.30~0.70, w_bus 0.15~0.50, w_facility 0.10~0.40, 0.05 간격, 합계 1
```

44동 전체에서 각 구성요소를 z표준화한 뒤 과거 팀 사후 대리매핑 3동만 상위8 선정에서 제외했다. 명시한 제한 범위에서 결정적으로 생성되는 시나리오는 **{weight['scenarioCount']}개**, 기준 후보와의 최저 Jaccard는 **{weight['minJaccard']:.6f}**다.

- 45/45 포함 기준후보: {', '.join(weight['stableDongs'])}
- 조건부 포함 기준후보: {', '.join(weight['conditionalDongs'])}
- 후보별 포함수: {candidate_count_text}

포함비율은 확률·선정 가능성이 아니다. 기준 50·30·20 시나리오와 후보 8개를 그대로 보존한 제한 범위 스트레스 진단이다. 이 범위는 분석자가 명시한 선택이므로 결과가 범위 경계에 의존하는지 별도로 감사했다.

### 3.1 전체 비음수 simplex 경계감사

```text
w_cag, w_bus, w_facility ∈ [0, 1], 0.05 간격, 합계 1
```

전체 비음수 simplex의 **{boundary['scenarioCount']}개** 조합을 추가 계산한 결과, 최저 Jaccard는 **{boundary['minJaccard']:.6f}**이고 **231/231에 포함된 기준후보는 {', '.join(boundary['stableDongs'])}**뿐이다.

- 조건부 기준후보: {', '.join(boundary['conditionalDongs'])}
- 후보별 포함수: {boundary_candidate_count_text}
- 제한 범위 밖에서 진입한 동: {', '.join(boundary['alternativeDongs'])}

전체 simplex는 0 또는 1의 극단 가중치까지 포함하므로 **실제 정책에서 타당한 가중치 집합이 아니다**. 45개 제한 범위에서 보인 안정성이 경계 선택과 무관하다는 주장을 반증하기 위한 감사층이며, 기준 후보 8개나 45개 결과를 대체하지 않는다.

## 4. 분석 2 — 의료 최근접거리 면적격자 커버리지

```text
거리 임계값 = 시간(분) × 60 × 0.8m/s
coverage_t = 동의 100m 격자 중 nearest_facility_m <= 거리 임계값인 격자 비율
```

| 그룹 | 동 수 | 5분 | 10분 | 15분 | 30분 | 평균 최근접거리 중앙값 | P90 중앙값 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 후보 | {coverage['candidateMedian']['areaCount']} | {coverage['candidateMedian']['coverage5']:.3f} | {coverage['candidateMedian']['coverage10']:.3f} | {coverage['candidateMedian']['coverage15']:.3f} | {coverage['candidateMedian']['coverage30']:.3f} | {coverage['candidateMedian']['meanNearestFacilityM']:.1f}m | {coverage['candidateMedian']['p90NearestFacilityM']:.1f}m |
| 비후보 | {coverage['nonCandidateMedian']['areaCount']} | {coverage['nonCandidateMedian']['coverage5']:.3f} | {coverage['nonCandidateMedian']['coverage10']:.3f} | {coverage['nonCandidateMedian']['coverage15']:.3f} | {coverage['nonCandidateMedian']['coverage30']:.3f} | {coverage['nonCandidateMedian']['meanNearestFacilityM']:.1f}m | {coverage['nonCandidateMedian']['p90NearestFacilityM']:.1f}m |

이는 동일면적 격자 비율이지 주민 비율이 아니다. 후보식에 의료거리 구성요소가 있어 후보/비후보 차이는 독립 검증이 아니라 담당자 해석을 위한 단위 변환이다.

## 5. 분석 3 — 공간가중행렬 강건성

모든 명세는 Global Moran, 조건부 Local Moran, 9,999회, `seed=42`, 양측 simulation-mean 편차, 44개 BH-FDR을 동일하게 사용한다.

| 명세 | Moran I | 양측 p | FDR HH | FDR LL |
|---|---:|---:|---|---|
{spatial_lines}

Queen에서 유의한 관산동 HH가 centroid kNN에서 유지되지 않으면 “공간적으로 검증된 HH”가 아니라 **Queen 명세에서만 FDR 유의**라고 제한한다.

## 6. 분석 4 — 과거 팀 사후 대리매핑 3동 임의 top3 중첩 정확 기준선

```text
X ~ Hypergeometric(N=44, K=3, n=3)
P(X=x) = C(3,x) C(41,3-x) / C(44,3)
```

- 기준 DSS top3: {', '.join(overlap['baselineTop3Dongs'])}
- 현행 매핑과 관측 중첩: {overlap['observedOverlap']}곳
- 무작위 기대 중첩: {overlap['expectedOverlap']:.6f}곳
- `P(X >= {overlap['observedOverlap']})`: {overlap['pAtLeastObserved']:.6f}

과거 팀 사후 대리매핑 3동은 정답집합이 아니므로 이 값은 예측성능이 아니라 우연 중첩 참고치다.

## 7. 분석 5 — 수요정의·HIRA 시설계층 단일축 견고성

| 시나리오 | 변경축 | 기준 후보 Jaccard | 이탈 | 진입 |
|---|---|---:|---|---|
{construct_lines}

한 번에 한 축만 바꿨으므로 수요정의와 시설계층의 상호작용까지 증명하지 않는다. 약국·병의원등은 실제 62개 돌봄서비스와 동일하지 않다.

## 8. 분석 6 — DSS 구성요소 의존성

44개 행정동에서 DSS 상위 구성요소의 Pearson·Spearman과 VIF를 함께 계산했다.

| 구성요소 A | 구성요소 B | Pearson r | Spearman rho | `|rho|>=.8` |
|---|---|---:|---:|---|
{dependence_lines}

| 구성요소 | 다른 두 요소 설명 R2 | VIF |
|---|---:|---:|
{vif_lines}

버스 비효율과 의료시설 평균 최근접거리는 Pearson **{next(row['pearsonR'] for row in dependence['pairRows'] if row['componentA'] == 'bus' and row['componentB'] == 'facility'):.6f}**, Spearman **{next(row['spearmanRho'] for row in dependence['pairRows'] if row['componentA'] == 'bus' and row['componentB'] == 'facility'):.6f}**다. VIF는 모두 5 미만이지만, 단조순위 의존성이 매우 커 두 항을 서로 독립된 증거처럼 설명하지 않는다. 이는 변수 삭제 자동기준이나 인과 진단이 아니다.

## 9. 분석 7 — DSS 상위 구성요소 ablation

| 시나리오 | CAG | 버스 | 명시적 의료거리 | 기준 Top8 Jaccard | 이탈 | 진입 |
|---|---:|---:|---:|---:|---|---|
{ablation_lines}

- **4개 ablation 명세 모두에 포함된 안정 핵심:** {', '.join(ablation['stableCoreDongs'])}
- **기준 후보지만 4개 중 일부에서만 포함된 조건부 후보:** {', '.join(ablation['conditionalBaselineDongs'])}
- **제거 명세에서 진입한 비기준 후보:** {', '.join(ablation['alternativeEntryDongs'])}

여기서 안정 핵심은 오직 `기준 / 버스 항 제거 / 명시적 의료거리 항 제거 / 두 항 동시 제거`의 **4개 시나리오 교집합**이다. 앞선 45개 가중치 격자의 5곳, 231개 경계감사의 1곳과 정의가 다르므로 서로 바꿔 말하지 않는다. 또한 CAG 내부에 RI 시설접근성이 남아 있어 “시설 영향 완전 제거”가 아니다.

![DSS ablation Top8](../outputs/figures/pro_analysis/01_dss_ablation_top8.svg)

## 10. 분석 8 — 관산·행주·대화 비교

| 동 | 기준후보 | 고령화율 | 70+ 1인세대 | CAG | 노선/정류장 | 의료 평균거리 | 마을표기 정류장 | 고유 마을노선 | 전역순위 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
{focus_lines}

관산·행주는 기준 후보, 대화는 비후보 비교 동이다. 세 동만 고른 기술 비교이므로 대화동을 통계적 대조군으로 부르거나 후보·비후보 차이의 인과근거로 쓰지 않는다.

![관산 행주 대화 마을버스 비교](../outputs/figures/pro_analysis/02_focus_area_village_bus.svg)

## 11. 분석 9 — 마을버스 정적 존재 1차 스크리닝

- 원본 정류장: **{village['rawStopCount']:,}개**, 행정동 경계 안 분석: **{village['insideStopCount']:,}개**, 경계 밖 제외: **{village['excludedOutsideStopCount']}개**
- 경계 안 노선표기: **{village['insideRouteMentionCount']:,}건**, 이 중 마을: **{village['villageRouteMentionCount']:,}건({village['villageRouteMentionShare'] * 100:.2f}%)**
- 마을노선 1개 이상 표기 정류장: **{village['villageServingStopCount']:,}개({village['villageServingStopShare'] * 100:.2f}%)**
- 고양시 전체 고유 마을노선명: **{village['uniqueVillageRouteCount']}개**
- 44동 중앙값: 마을표기 정류장 비율 **{village['areaMedianVillageServingStopShare'] * 100:.2f}%**, 고유 마을노선 **{village['areaMedianUniqueVillageRouteCount']:.1f}개**

`13_village_bus_area_screening.csv`는 44동의 정류장 수·마을표기 정류장 수/비율·노선표기 수/비율·고유 마을노선 수를 제공하고, `14_village_bus_route_presence.csv`는 동×마을노선별 표기 정류장 수를 제공한다. 두 낮은값 순위는 탐색용일 뿐 합성점수나 정책 우선순위가 아니다. 배차·운행횟수·방향·시간대·환승·OD·보행권을 알 수 없으므로 “마을버스 공급이 충분/부족하다”는 결론은 내리지 않는다.

## 12. 분석 10 — 의료시설까지의 이동시간 가정 시나리오

심사 질문의 “DRT 도입 전·후”를 현재 데이터로 관측된 운영성과처럼 계산할 수는 없다. RI는 의료시설 직선거리 기반 보행 마찰 대리이고 버스 대기·환승·도로망·DRT 운영로그가 없기 때문이다. 따라서 **RI의 단순 차이(`ΔRI`)는 계산하지 않고**, 같은 100m 격자의 최근접 HIRA 시설거리만 사용해 다음 두 값을 비교한다.

```text
보행대리 기준시간 = 최근접 HIRA 시설 직선거리 ÷ (0.8m/s × 60)
가정 DRT 시간 = 접근·승하차 5분 + 대기시간 + (1.3 × 직선거리) ÷ (15km/h)
대기시간 시나리오 = 5분, 10분, 15분
환승 = 0회 가정
```

15km/h·거리계수 1.3·접근 및 승하차 5분·대기 5/10/15분은 **관측값이 아닌 분석자 공개 가정**이다. 세 대기시간에서 나온 최솟값~최댓값만 범위로 제시하며, 이 범위는 확률·신뢰구간·운영효과 범위가 아니다.

| 후보 | 면적격자 | 보행대리 30분 커버리지 | 가정 DRT 30분 범위 | 변화 범위 | 보행대리 중앙시간 | 가정 DRT 중앙시간 범위 | 시간변화 범위 | 중앙 격자 손익분기 대기상한 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
{access_lines}

이 결과는 인과적 개선을 뜻하지 않는다. 허용되는 해석은 **“최근접 HIRA 시설·면적격자·고정 속도 가정에서는 대기시간에 따라 30분 커버리지와 중앙시간이 이 범위로 달라진다”**이다. 짧은 거리에서는 대기가 붙어 중앙시간이 오히려 늘 수 있어, 전 후보에 일률적 개선을 주장하지 않는다.

`중앙 격자 손익분기 대기상한`은 동 격자의 절반에서 가정 DRT가 보행대리보다 빠르려면 대기가 대략 몇 분 이하여야 하는지를 뜻한다. 실제 운영 SLA나 허용 대기시간이 아니며, 같은 속도·거리계수·접근시간 가정에 종속된다.

![후보 8동 의료시설 이동시간 가정 범위](../outputs/figures/pro_analysis/03_access_time_scenario.svg)

- `15_access_time_scenario_assumptions.csv`: 대기시간 3개와 고정 가정
- `16_access_time_scenarios_by_candidate.csv`: 후보×시나리오 24행의 30·45분 커버리지, 중앙·P90 시간, 변화량
- `17_access_time_scenario_ranges.csv`: 후보별 세 시나리오 최솟값~최댓값
- `18_access_time_data_quality.csv`: 결측·중복·거리분포·ID·사후정보 누수 점검
- 금지 해석: 실제 고양온돌 대상자, 실제 62개 서비스 목적지, 실제 버스/DRT 전후, 운영 성과, 인과효과
- 실측 전후로 승격할 최소 데이터: 익명 여정 ID, 적격 대상 분모, 실제 62개 서비스의 좌표·서비스 유형, 요청·배차·픽업·도착 시각, 출발·도착 좌표 또는 행정동, 실제 주행거리·공유승차 우회, 배차실패·취소·거절, 승하차 보조시간, 고정노선 시간표·환승, 비용, 시행 전 비교기간과 비슷한 비교권역.
- 다음 검증: 위 필드를 개인정보 비식별·최소수집 계약으로 확보하고 동일 계절의 시행 전 기준선 및 비교권역을 둔 파일럿/단계도입 분석을 설계한다. 그때만 대상자 가중 도달률과 실제 전후효과를 평가한다.

## 13. 입력 무결성

### 처리 입력

| ID | 상대경로 | 바이트 | SHA-256 |
|---|---|---:|---|
{input_lines}

### 원자료 SHA 계보

| Source ID | 기준일 | SHA-256 | 상태 |
|---|---|---|---|
{raw_lines}

## 14. 산출물과 재현

```powershell
python scripts/build_professional_analysis.py
node --test tests/pro-analysis.test.js
```

- `public/data/pro_analysis.js`: UI용 진단 데이터
- `outputs/tables/pro_analysis/*.csv`: 행·시나리오 수준 재현표
- `outputs/figures/pro_analysis/*.svg`: ablation·3동 비교·이동시간 시나리오 결정적 벡터도표
- `reports/PRO_ANALYSIS_METHOD.md`: 본 명세와 결과

빌더는 벽시계 시간을 기록하지 않고 입력 SHA와 고정 명세로 run ID를 만들기 때문에 같은 입력에서 바이트가 동일해야 한다. 원자료를 수정하거나 덮어쓰지 않는다.

## 15. 서비스·정책 의미와 위험

- 활용: 후보를 자동 확정하지 않고, 가중치 민감 후보와 의료거리 꼬리가 큰 동에서 어떤 운영자료를 먼저 확인할지 설계한다.
- 한계: 개인·OD·호출·운영비·62개 서비스 위치가 없고, 면적격자·직선거리·혼합시점과 분석자 이동시간 가정에 의존한다.
- 금지 해석: 포함확률, 성공확률, 정책효과, 최적지, 실제 주민 30분 도달률, 실제 DRT 전후 개선.
- 다음 검증: 실제 목적지·시간대별 이동·호출 실패·운영비를 확보했을 때만 정책효과와 운영대안을 평가한다.
"""


def write_outputs(
    payload: dict[str, Any],
    table_groups: list[tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]],
    input_manifest: list[dict[str, Any]],
    raw_manifest: list[dict[str, Any]],
) -> None:
    OUTPUT_TABLE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_FIGURE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    input_hashes = manifest_hash_string(input_manifest)
    raw_hashes = raw_hash_string(raw_manifest)
    write_input_manifest_csv(input_manifest, raw_manifest)
    for analysis_payload, tables in table_groups:
        for filename, rows in tables.items():
            write_analysis_csv(
                filename,
                rows,
                analysis_id=analysis_payload["analysisId"],
                unit=analysis_payload["unit"],
                formula=analysis_payload["formula"],
                limitation=analysis_payload["limitation"],
                input_hashes=input_hashes,
                raw_hashes=raw_hashes,
            )

    serializable = builtin(payload)
    OUTPUT_JS.write_text(
        "window.DDOL_PRO_ANALYSIS = "
        + json.dumps(serializable, ensure_ascii=False, sort_keys=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
        newline="\n",
    )
    OUTPUT_REPORT.write_text(
        render_report(serializable, input_manifest, raw_manifest),
        encoding="utf-8",
        newline="\n",
    )
    write_figures(serializable)


def main() -> None:
    input_manifest = build_input_manifest()
    raw_manifest = load_raw_source_manifest()
    area, grid, adjacency, facilities, bus_stops = load_inputs()
    validate_inputs(area, grid, adjacency, facilities, bus_stops)

    weight_payload, weight_tables, boundary_weight_tables = compute_weight_sensitivity(area)
    coverage_payload, coverage_tables = compute_facility_coverage(area, grid)
    spatial_payload, spatial_tables = compute_spatial_sensitivity(area, adjacency)
    overlap_payload, overlap_tables = compute_overlap_null(area)
    construct_payload, construct_tables = compute_construct_sensitivity(area, grid, facilities)
    dependence_payload, dependence_tables = compute_dss_component_dependence(area)
    ablation_payload, ablation_tables = compute_dss_component_ablation(area)
    village_payload, village_tables = compute_village_bus_screening(area, bus_stops)
    focus_payload, focus_tables = compute_focus_area_comparison(area, village_payload)
    access_payload, access_tables = compute_accessibility_time_scenarios(area, grid)

    metadata = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": ARTIFACT_DATE,
        "analysisRunId": run_id(input_manifest),
        "snapshotId": SNAPSHOT_ID,
        "purpose": "기준 후보 8개를 보존한 강건성·반증·행정해석·이동시간 가정 시나리오 진단",
        "diagnosticPolicy": (
            "포함수·Jaccard·p값은 확률·확정순위·정책효과가 아니다. 후보 8개는 기준 시나리오이며 담당자의 현장확인을 돕는다."
        ),
        "collectionOrderPolicy": "동 집합은 순위가 아니라 고정 후보순서 후 동명순으로 제공한다.",
        "sourceDates": SOURCE_DATES,
        "seed": SEED,
        "permutations": PERMUTATIONS,
        "inputManifest": input_manifest,
        "rawSourceManifest": raw_manifest,
        "limitations": [
            "개인·OD·호출·운영비·62개 서비스 위치를 사용하지 않는다.",
            "면적격자·직선거리·혼합시점 공개데이터 대리분석이다.",
            "candidate_top8과 current_drt_flag는 독립 예측 타깃이 아니다.",
            "DSS 상위 항 제거는 CAG 내부 RI 시설접근성을 제거하지 않는다.",
            "마을버스 표기는 정적 노선 존재이며 배차·운행량·OD·환승을 제공하지 않는다.",
            "이동시간 범위는 관측 전후효과가 아니라 대기시간 3개와 고정 속도·거리계수의 공개 가정이다.",
        ],
    }
    baseline = {
        "modelId": MODEL_ID,
        "areaCount": 44,
        "eligibleAreaCount": 41,
        "candidateCount": 8,
        "currentDrtMappedCount": 3,
        "candidateDongs": CANDIDATE_DONGS,
        "weights": {"cag": BASE_WEIGHTS[0], "bus": BASE_WEIGHTS[1], "facility": BASE_WEIGHTS[2]},
        "formula": "0.5*z(CAG)+0.3*z(bus_inefficiency)+0.2*z(nearest_facility_mean_m)",
        "limitation": "팀 대리명세이며 공식 가중치·확정 우선순위가 아니다.",
    }
    payload = {
        "metadata": metadata,
        "baseline": baseline,
        "weightSensitivity": weight_payload,
        "facilityCoverage": coverage_payload,
        "spatialWeights": spatial_payload,
        "overlapNull": overlap_payload,
        "constructSensitivity": construct_payload,
        "dssComponentDependence": dependence_payload,
        "dssAblation": ablation_payload,
        "villageBusScreening": village_payload,
        "focusComparison": focus_payload,
        "accessibilityTimeScenarios": access_payload,
    }
    table_groups = [
        (weight_payload, weight_tables),
        (weight_payload["boundaryAudit"], boundary_weight_tables),
        (coverage_payload, coverage_tables),
        (
            {
                "analysisId": "spatial_weights_sensitivity_v1",
                "unit": "Moran I·z·spatial lag 무차원; p·q 0~1",
                "formula": spatial_payload[0]["formula"],
                "limitation": spatial_payload[0]["limitation"],
            },
            spatial_tables,
        ),
        (overlap_payload, overlap_tables),
        (construct_payload, construct_tables),
        (dependence_payload, dependence_tables),
        (ablation_payload, ablation_tables),
        (focus_payload, focus_tables),
        (village_payload, village_tables),
        (access_payload, access_tables),
    ]
    write_outputs(payload, table_groups, input_manifest, raw_manifest)
    print(
        json.dumps(
            {
                "analysisRunId": metadata["analysisRunId"],
                "scenarioCount": weight_payload["scenarioCount"],
                "minJaccard": weight_payload["minJaccard"],
                "boundaryScenarioCount": weight_payload["boundaryAudit"]["scenarioCount"],
                "boundaryMinJaccard": weight_payload["boundaryAudit"]["minJaccard"],
                "spatialMethods": [row["method"] for row in spatial_payload],
                "dssAblationStableCoreDongs": ablation_payload["stableCoreDongs"],
                "villageBusInsideStopCount": village_payload["insideStopCount"],
                "uniqueVillageRouteCount": village_payload["uniqueVillageRouteCount"],
                "accessWaitScenarioMinutes": access_payload["waitScenarioMinutes"],
                "accessCandidateRangeCount": len(access_payload["candidateRangeRows"]),
                "outputDirectory": "outputs/tables/pro_analysis",
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
