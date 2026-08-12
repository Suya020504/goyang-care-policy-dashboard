const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');


const ROOT = path.join(__dirname, '..');
const BUILD_PATH = path.join(ROOT, 'scripts', 'build_professional_analysis.py');
const DATA_PATH = path.join(ROOT, 'public', 'data', 'pro_analysis.js');
const REPORT_PATH = path.join(ROOT, 'reports', 'PRO_ANALYSIS_METHOD.md');
const LINEAGE_PATH = path.join(ROOT, 'reports', 'DATA_LINEAGE.md');
const TABLE_DIR = path.join(ROOT, 'outputs', 'tables', 'pro_analysis');
const FIGURE_DIR = path.join(ROOT, 'outputs', 'figures', 'pro_analysis');
const PYTHON = process.env.PYTHON || 'python';

const EXPECTED_CANDIDATES = [
  '가좌동', '고양동', '관산동', '능곡동', '송포동', '주교동', '행주동', '효자동',
];
const EXPECTED_TABLES = [
  '00_input_manifest.csv',
  '01_weight_scenarios.csv',
  '02_weight_area_stability.csv',
  '02a_weight_boundary_scenarios.csv',
  '02b_weight_boundary_area_stability.csv',
  '03_facility_coverage_by_area.csv',
  '04_facility_coverage_group_medians.csv',
  '05_spatial_weights_global.csv',
  '06_spatial_weights_local.csv',
  '07_overlap_hypergeom_null.csv',
  '08_construct_sensitivity.csv',
  '09_dss_component_correlations.csv',
  '09a_dss_component_vif.csv',
  '10_dss_ablation_scenarios.csv',
  '11_dss_ablation_area_stability.csv',
  '12_focus_area_comparison.csv',
  '13_village_bus_area_screening.csv',
  '14_village_bus_route_presence.csv',
  '15_access_time_scenario_assumptions.csv',
  '16_access_time_scenarios_by_candidate.csv',
  '17_access_time_scenario_ranges.csv',
  '18_access_time_data_quality.csv',
];
const EXPECTED_FIGURES = [
  '01_dss_ablation_top8.svg',
  '02_focus_area_village_bus.svg',
  '03_access_time_scenario.svg',
];
const REQUIRED_CSV_METADATA = [
  'artifact_schema_version', 'analysis_id', 'snapshot_id', 'source_dates',
  'unit_definition', 'formula', 'limitation', 'input_sha256', 'raw_source_sha256',
];


function runBuilder() {
  const result = spawnSync(PYTHON, [BUILD_PATH], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `전문분석 빌더 실패\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  return result.stdout.trim();
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
}

function generatedFiles() {
  const tables = fs.readdirSync(TABLE_DIR)
    .filter((name) => name.endsWith('.csv'))
    .sort()
    .map((name) => path.join(TABLE_DIR, name));
  const figures = fs.readdirSync(FIGURE_DIR)
    .filter((name) => name.endsWith('.svg'))
    .sort()
    .map((name) => path.join(FIGURE_DIR, name));
  return [DATA_PATH, REPORT_PATH, ...tables, ...figures];
}

function artifactHashes() {
  return Object.fromEntries(generatedFiles().map((filePath) => [
    path.relative(ROOT, filePath).replaceAll('\\', '/'),
    sha256(filePath),
  ]));
}

function loadData() {
  const source = fs.readFileSync(DATA_PATH, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: DATA_PATH });
  assert.ok(sandbox.window.DDOL_PRO_ANALYSIS, 'window.DDOL_PRO_ANALYSIS가 생성되어야 합니다.');
  return JSON.parse(JSON.stringify(sandbox.window.DDOL_PRO_ANALYSIS));
}

function approx(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual}가 기대값 ${expected}의 허용오차 ${tolerance} 밖입니다.`,
  );
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, 'ko'));
}

function collectKeys(value, keys = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
    return keys;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => {
      keys.push(key);
      collectKeys(child, keys);
    });
  }
  return keys;
}


const data = loadData();


test('빌더는 같은 입력에서 모든 전문분석 산출물을 바이트 단위로 동일하게 만든다', {
  skip: process.env.DDOL_ANALYSIS_ROOT ? false : '공개 저장소에는 원자료가 없으므로 DDOL_ANALYSIS_ROOT 지정 시에만 재생성합니다.',
}, () => {
  const firstRun = runBuilder();
  const firstHashes = artifactHashes();
  const secondRun = runBuilder();
  const secondHashes = artifactHashes();
  assert.equal(firstRun, secondRun);
  assert.deepEqual(secondHashes, firstHashes);
  assert.deepEqual(
    fs.readdirSync(TABLE_DIR).filter((name) => name.endsWith('.csv')).sort(),
    EXPECTED_TABLES,
  );
  assert.deepEqual(
    fs.readdirSync(FIGURE_DIR).filter((name) => name.endsWith('.svg')).sort(),
    EXPECTED_FIGURES,
  );
});

test('전문분석 JS 스키마와 입력 SHA·기간·진단 경계를 제공한다', () => {
  assert.deepEqual(Object.keys(data), [
    'metadata', 'baseline', 'weightSensitivity', 'facilityCoverage',
    'spatialWeights', 'overlapNull', 'constructSensitivity',
    'dssComponentDependence', 'dssAblation', 'villageBusScreening',
    'focusComparison', 'accessibilityTimeScenarios',
  ]);
  assert.equal(data.metadata.schemaVersion, '1.2.0');
  assert.equal(data.metadata.generatedAt, '2026-08-13');
  assert.match(data.metadata.analysisRunId, /^[A-F0-9]{20}$/);
  assert.equal(data.metadata.seed, 42);
  assert.equal(data.metadata.permutations, 9999);
  assert.deepEqual(data.metadata.sourceDates, {
    population: '2026-06-30',
    onePersonHouseholds: '2026-06-30',
    hiraFacilities: '2026-06-30',
    analysisBoundary: '2026-04-01',
    busStops: '2025-08-25',
  });
  assert.equal(data.metadata.inputManifest.length, 8);
  assert.equal(data.metadata.rawSourceManifest.length, 6);
  data.metadata.inputManifest.forEach((input) => {
    assert.match(input.sha256, /^[A-F0-9]{64}$/);
    assert.ok(input.bytes > 0);
    assert.equal(path.isAbsolute(input.relativePath), false);
  });
  data.metadata.rawSourceManifest.forEach((source) => {
    assert.match(source.sha256, /^[A-F0-9]{64}$/);
    assert.match(source.snapshotDate, /^\d{4}-\d{2}-\d{2}$/);
  });
  assert.match(data.metadata.diagnosticPolicy, /확정순위·정책효과가 아니다/);
  assert.match(data.metadata.limitations.join(' '), /관측 전후효과가 아니라/);
});

test('기준 후보 8개와 사후정보 제외 계약을 보존한다', () => {
  assert.equal(data.baseline.modelId, 'poster_proxy_v1');
  assert.equal(data.baseline.areaCount, 44);
  assert.equal(data.baseline.eligibleAreaCount, 41);
  assert.equal(data.baseline.candidateCount, 8);
  assert.equal(data.baseline.currentDrtMappedCount, 3);
  assert.deepEqual(data.baseline.candidateDongs, EXPECTED_CANDIDATES);
  assert.deepEqual(data.baseline.weights, { cag: 0.5, bus: 0.3, facility: 0.2 });
  assert.match(data.baseline.limitation, /확정 우선순위가 아니다/);
});

test('명시한 제한 범위 weight simplex는 45개이며 포함수·순위범위를 정확히 제공한다', () => {
  const analysis = data.weightSensitivity;
  assert.equal(analysis.scenarioCount, 45);
  approx(analysis.minJaccard, 5 / 11);
  assert.deepEqual(analysis.stableDongs, ['가좌동', '고양동', '관산동', '주교동', '행주동']);
  assert.deepEqual(analysis.conditionalDongs, ['능곡동', '송포동', '효자동']);
  assert.deepEqual(analysis.alternativeDongs, ['성사2동', '일산1동', '중산1동']);
  assert.equal(new Set(analysis.scenarios.map((row) => row.scenarioId)).size, 45);

  analysis.scenarios.forEach((row) => {
    approx(row.weightCag + row.weightBus + row.weightFacility, 1);
    assert.ok(row.weightCag >= 0.30 && row.weightCag <= 0.70);
    assert.ok(row.weightBus >= 0.15 && row.weightBus <= 0.50);
    assert.ok(row.weightFacility >= 0.10 && row.weightFacility <= 0.40);
    [row.weightCag, row.weightBus, row.weightFacility].forEach((weight) => {
      const fivePointSteps = weight * 100 / 5;
      approx(fivePointSteps, Math.round(fivePointSteps));
    });
    assert.equal(row.top8Dongs.length, 8);
    assert.equal(new Set(row.top8Dongs).size, 8);
    assert.equal(row.intersectionCount, row.top8Dongs.filter((dong) => EXPECTED_CANDIDATES.includes(dong)).length);
    approx(row.jaccardVsBaseline, row.intersectionCount / (16 - row.intersectionCount));
  });

  const baseScenario = analysis.scenarios.find((row) => (
    row.weightCag === 0.5 && row.weightBus === 0.3 && row.weightFacility === 0.2
  ));
  assert.ok(baseScenario);
  assert.deepEqual(baseScenario.top8Dongs, EXPECTED_CANDIDATES);
  assert.equal(baseScenario.jaccardVsBaseline, 1);

  assert.equal(analysis.inclusionRows.length, 41);
  const inclusion = Object.fromEntries(analysis.inclusionRows.map((row) => [row.dong, row]));
  assert.deepEqual(
    Object.fromEntries(EXPECTED_CANDIDATES.map((dong) => [dong, inclusion[dong].count])),
    { 가좌동: 45, 고양동: 45, 관산동: 45, 능곡동: 37, 송포동: 31, 주교동: 45, 행주동: 45, 효자동: 42 },
  );
  analysis.inclusionRows.forEach((row) => {
    approx(row.share, row.count / 45);
    assert.ok(row.minRank >= 1 && row.maxRank <= 41);
    assert.ok(row.minRank <= row.medianRank && row.medianRank <= row.maxRank);
  });
});

test('전체 비음수 simplex 231개 경계감사는 제한 범위 의존성을 별도로 고정한다', () => {
  const audit = data.weightSensitivity.boundaryAudit;
  assert.equal(audit.analysisId, 'weight_simplex_boundary_audit_v1');
  assert.equal(audit.scenarioCount, 231);
  approx(audit.minJaccard, 1 / 3);
  assert.deepEqual(audit.bounds, {
    cag: { min: 0, max: 1 },
    bus: { min: 0, max: 1 },
    facility: { min: 0, max: 1 },
    step: 0.05,
    sum: 1,
  });
  assert.deepEqual(audit.stableDongs, ['고양동']);
  assert.deepEqual(
    audit.conditionalDongs,
    ['가좌동', '관산동', '능곡동', '송포동', '주교동', '행주동', '효자동'],
  );
  assert.deepEqual(
    sorted(audit.alternativeDongs),
    sorted(['대덕동', '성사2동', '원신동', '일산1동', '장항1동', '중산1동', '행신4동']),
  );
  assert.match(audit.purpose, /경계 의존성 반증/);
  assert.match(audit.limitation, /실제 정책에서 타당한 가중치 집합으로 가정하지 않는다/);
  assert.match(audit.limitation, /확률이 아니다/);

  assert.equal(new Set(audit.scenarios.map((row) => row.scenarioId)).size, 231);
  assert.equal(new Set(audit.scenarios.map((row) => (
    `${row.weightCag}|${row.weightBus}|${row.weightFacility}`
  ))).size, 231);
  audit.scenarios.forEach((row) => {
    approx(row.weightCag + row.weightBus + row.weightFacility, 1);
    [row.weightCag, row.weightBus, row.weightFacility].forEach((weight) => {
      assert.ok(weight >= 0 && weight <= 1);
      approx(weight / 0.05, Math.round(weight / 0.05));
    });
    assert.equal(row.top8Dongs.length, 8);
    assert.equal(new Set(row.top8Dongs).size, 8);
    assert.equal(
      row.intersectionCount,
      row.top8Dongs.filter((dong) => EXPECTED_CANDIDATES.includes(dong)).length,
    );
    approx(row.jaccardVsBaseline, row.intersectionCount / (16 - row.intersectionCount));
  });

  const baseScenario = audit.scenarios.find((row) => (
    row.weightCag === 0.5 && row.weightBus === 0.3 && row.weightFacility === 0.2
  ));
  assert.ok(baseScenario);
  assert.deepEqual(baseScenario.top8Dongs, EXPECTED_CANDIDATES);

  assert.equal(audit.inclusionRows.length, 41);
  const inclusion = Object.fromEntries(audit.inclusionRows.map((row) => [row.dong, row]));
  assert.deepEqual(
    Object.fromEntries(EXPECTED_CANDIDATES.map((dong) => [dong, inclusion[dong].count])),
    { 가좌동: 217, 고양동: 231, 관산동: 124, 능곡동: 189, 송포동: 167, 주교동: 182, 행주동: 206, 효자동: 200 },
  );
  assert.deepEqual(
    Object.fromEntries(
      ['대덕동', '성사2동', '원신동', '일산1동', '장항1동', '중산1동', '행신4동']
        .map((dong) => [dong, inclusion[dong].count]),
    ),
    { 대덕동: 107, 성사2동: 55, 원신동: 30, 일산1동: 33, 장항1동: 52, 중산1동: 42, 행신4동: 13 },
  );
  audit.inclusionRows.forEach((row) => {
    approx(row.share, row.count / 231);
    assert.ok(row.minRank >= 1 && row.maxRank <= 41);
    assert.ok(row.minRank <= row.medianRank && row.medianRank <= row.maxRank);
  });

  ['02a_weight_boundary_scenarios.csv', '02b_weight_boundary_area_stability.csv']
    .forEach((filename) => {
      const source = fs.readFileSync(path.join(TABLE_DIR, filename), 'utf8');
      assert.match(source, /weight_simplex_boundary_audit_v1/);
      assert.match(source, /경계 의존성을 반증/);
    });
});

test('100m 격자 의료 커버리지는 44동·26,595격자와 단조 임계값을 보존한다', () => {
  const analysis = data.facilityCoverage;
  assert.deepEqual(analysis.thresholdMinutes, [5, 10, 15, 30]);
  assert.deepEqual(analysis.thresholdDistancesM, [240, 480, 720, 1440]);
  assert.equal(analysis.areaRows.length, 44);
  assert.equal(analysis.areaRows.reduce((sum, row) => sum + row.gridCount, 0), 26595);
  assert.equal(analysis.areaRows.filter((row) => row.candidate).length, 8);
  assert.equal(analysis.areaRows.filter((row) => row.currentDrtMapped).length, 3);
  analysis.areaRows.forEach((row) => {
    [row.coverage5, row.coverage10, row.coverage15, row.coverage30].forEach((value) => {
      assert.ok(value >= 0 && value <= 1);
    });
    assert.ok(row.coverage5 <= row.coverage10);
    assert.ok(row.coverage10 <= row.coverage15);
    assert.ok(row.coverage15 <= row.coverage30);
    assert.ok(row.p90NearestFacilityM >= row.meanNearestFacilityM);
  });
  assert.equal(analysis.candidateMedian.areaCount, 8);
  assert.equal(analysis.nonCandidateMedian.areaCount, 36);
  approx(analysis.candidateMedian.coverage15, 0.21764413900280177);
  approx(analysis.candidateMedian.coverage30, 0.5295129898967805);
  approx(analysis.nonCandidateMedian.coverage15, 0.9763789746917586);
  approx(analysis.nonCandidateMedian.coverage30, 1);
  approx(analysis.candidateMedian.p90NearestFacilityM, 2375.1367137636394, 1e-9);
});

test('의료시설 이동시간 시나리오는 관측효과와 분리된 3개 공개 가정과 데이터 품질을 제공한다', () => {
  const analysis = data.accessibilityTimeScenarios;
  assert.equal(analysis.analysisId, 'candidate_access_time_assumption_scenarios_v1');
  assert.equal(analysis.effectStatus, 'hypothetical_scenario_not_observed_before_after');
  assert.deepEqual(analysis.coverageThresholdMinutes, [30, 45]);
  assert.deepEqual(analysis.waitScenarioMinutes, [5, 10, 15]);
  assert.deepEqual(analysis.assumptions, {
    walkingSpeedMps: 0.8,
    fixedAccessEgressMinutes: 5,
    networkDistanceFactor: 1.3,
    inVehicleSpeedKmh: 15,
    assumedTransfers: 0,
    waitTimeWeight: 1,
    assumptionStatus: 'analyst_defined_not_observed',
  });
  assert.deepEqual(analysis.scenarios.map((row) => row.scenarioId), [
    'wait_05m', 'wait_10m', 'wait_15m',
  ]);
  analysis.scenarios.forEach((row, index) => {
    assert.equal(row.waitMinutes, [5, 10, 15][index]);
    assert.equal(row.fixedAccessEgressMinutes, 5);
    assert.equal(row.networkDistanceFactor, 1.3);
    assert.equal(row.inVehicleSpeedKmh, 15);
    assert.equal(row.assumedTransfers, 0);
    assert.equal(row.assumptionStatus, 'analyst_defined_not_observed');
  });

  assert.deepEqual(analysis.dataQuality, {
    gridRowCount: 26595,
    uniqueGridCoordinateCount: 26595,
    requiredFieldMissingCount: 0,
    duplicateGridCoordinateCount: 0,
    negativeDistanceCount: 0,
    candidateAreaCount: 8,
    nonCandidateAreaCount: 36,
    currentDrtMappedAreaCount: 3,
    candidateGridCount: 11523,
    distanceMinM: analysis.dataQuality.distanceMinM,
    distanceMedianM: analysis.dataQuality.distanceMedianM,
    distanceP90M: analysis.dataQuality.distanceP90M,
    distanceP99M: analysis.dataQuality.distanceP99M,
    distanceMaxM: analysis.dataQuality.distanceMaxM,
    outlierPolicy: analysis.dataQuality.outlierPolicy,
    targetStatus: analysis.dataQuality.targetStatus,
    idPolicy: analysis.dataQuality.idPolicy,
    leakagePolicy: analysis.dataQuality.leakagePolicy,
  });
  approx(analysis.dataQuality.distanceMedianM, 943.543130835482);
  approx(analysis.dataQuality.distanceP99M, 6243.3834675964, 1e-9);
  approx(analysis.dataQuality.distanceMaxM, 7398.89611200741, 1e-9);
  assert.match(analysis.dataQuality.outlierPolicy, /절단·대체 없음/);
  assert.match(analysis.dataQuality.targetStatus, /독립 예측 타깃 없음/);
  assert.match(analysis.dataQuality.idPolicy, /결합·추적에만/);
  assert.match(analysis.dataQuality.leakagePolicy, /current_drt_flag/);
  assert.match(analysis.scenarioRangePolicy, /확률·신뢰구간이 아니다/);
  assert.match(analysis.breakEvenWaitDefinition, /최대 대기분/);
  assert.match(analysis.breakEvenWaitDefinition, /음수면 대기 0분이어도/);
  assert.match(analysis.limitation, /실제 도입 전후·인과효과·예측값이 아니라/);
  assert.match(analysis.limitation, /62개 돌봄서비스 목적지가 아니고/);
});

test('후보 8동의 3개 대기시간별 커버리지·시간과 범위 집계가 결정적으로 일치한다', () => {
  const analysis = data.accessibilityTimeScenarios;
  assert.equal(analysis.candidateRows.length, 24);
  assert.equal(analysis.candidateRangeRows.length, 8);
  assert.deepEqual(analysis.candidateRangeRows.map((row) => row.dong), EXPECTED_CANDIDATES);
  assert.equal(
    analysis.candidateRangeRows.reduce((sum, row) => sum + row.gridCount, 0),
    11523,
  );

  EXPECTED_CANDIDATES.forEach((dong) => {
    const rows = analysis.candidateRows.filter((row) => row.dong === dong);
    assert.deepEqual(rows.map((row) => row.waitMinutes), [5, 10, 15]);
    assert.equal(new Set(rows.map((row) => row.code)).size, 1);
    assert.equal(new Set(rows.map((row) => row.gridCount)).size, 1);
    assert.equal(new Set(rows.map((row) => row.referenceMedianMinutes)).size, 1);
    assert.equal(new Set(rows.map((row) => row.referenceCoverage30)).size, 1);
    assert.equal(new Set(rows.map((row) => row.referenceCoverage45)).size, 1);
    rows.forEach((row, index) => {
      assert.ok(row.scenarioCoverage30 >= 0 && row.scenarioCoverage30 <= 1);
      assert.ok(row.scenarioCoverage45 >= 0 && row.scenarioCoverage45 <= 1);
      assert.ok(row.scenarioFasterGridShare >= 0 && row.scenarioFasterGridShare <= 1);
      assert.ok(row.scenarioCoverage30 <= row.scenarioCoverage45);
      approx(
        row.coverage30ChangePercentagePoints,
        100 * (row.scenarioCoverage30 - row.referenceCoverage30),
      );
      approx(
        row.coverage45ChangePercentagePoints,
        100 * (row.scenarioCoverage45 - row.referenceCoverage45),
      );
      approx(
        row.scenarioMedianMinutes,
        5 + row.waitMinutes + 1.3 * (row.referenceMedianMinutes * 0.8 * 60) / (15000 / 60),
      );
      if (index > 0) {
        approx(row.scenarioMedianMinutes - rows[index - 1].scenarioMedianMinutes, 5);
        assert.ok(row.scenarioCoverage30 <= rows[index - 1].scenarioCoverage30);
        assert.ok(row.scenarioCoverage45 <= rows[index - 1].scenarioCoverage45);
        assert.ok(row.scenarioFasterGridShare <= rows[index - 1].scenarioFasterGridShare);
      }
    });

    const range = analysis.candidateRangeRows.find((row) => row.dong === dong);
    approx(range.scenarioMedianMinutesLow, Math.min(...rows.map((row) => row.scenarioMedianMinutes)));
    approx(range.scenarioMedianMinutesHigh, Math.max(...rows.map((row) => row.scenarioMedianMinutes)));
    approx(range.scenarioCoverage30Low, Math.min(...rows.map((row) => row.scenarioCoverage30)));
    approx(range.scenarioCoverage30High, Math.max(...rows.map((row) => row.scenarioCoverage30)));
    approx(
      range.coverage30ChangePercentagePointsLow,
      Math.min(...rows.map((row) => row.coverage30ChangePercentagePoints)),
    );
    approx(
      range.coverage30ChangePercentagePointsHigh,
      Math.max(...rows.map((row) => row.coverage30ChangePercentagePoints)),
    );
    assert.ok(range.breakEvenWaitP25Minutes <= range.breakEvenWaitMedianMinutes);
    assert.ok(range.breakEvenWaitMedianMinutes <= range.breakEvenWaitP75Minutes);
    assert.ok(
      range.nonnegativeBreakEvenWaitGridShare >= 0
      && range.nonnegativeBreakEvenWaitGridShare <= 1,
    );
    approx(
      range.breakEvenWaitMedianMinutes,
      range.referenceMedianMinutes
        - 5
        - 1.3 * (range.referenceMedianMinutes * 0.8 * 60) / (15000 / 60),
    );
  });

  const byDong = Object.fromEntries(analysis.candidateRangeRows.map((row) => [row.dong, row]));
  approx(byDong.관산동.referenceCoverage30, 0.8849230769230769);
  approx(byDong.관산동.scenarioCoverage30Low, 0.9956923076923077);
  approx(byDong.관산동.scenarioCoverage30High, 1);
  approx(byDong.관산동.medianTimeChangeMinutesLow, -2.18215452177717, 1e-9);
  approx(byDong.관산동.medianTimeChangeMinutesHigh, 7.81784547822283, 1e-9);
  approx(byDong.관산동.breakEvenWaitMedianMinutes, 7.18215452177717, 1e-9);
  approx(byDong.효자동.referenceCoverage30, 0.13564668769716087);
  approx(byDong.효자동.scenarioCoverage30Low, 0.17310725552050474);
  approx(byDong.효자동.scenarioCoverage30High, 0.3426656151419558);
  assert.ok(byDong.관산동.medianTimeChangeMinutesHigh > 0, '긴 대기에서 관산동 중앙시간 증가는 보존해야 한다.');
  assert.ok(byDong.주교동.medianTimeChangeMinutesHigh > 0, '긴 대기에서 주교동 중앙시간 증가는 보존해야 한다.');
  approx(byDong.주교동.breakEvenWaitMedianMinutes, 8.011705917836979, 1e-9);
});

test('Queen·대칭 kNN4·kNN6 공간명세를 같은 seed·순열·FDR로 비교한다', () => {
  assert.deepEqual(data.spatialWeights.map((row) => row.method), ['queen', 'symmetricKnn4', 'symmetricKnn6']);
  const byMethod = Object.fromEntries(data.spatialWeights.map((row) => [row.method, row]));
  approx(byMethod.queen.moranI, 0.2957432901700902);
  approx(byMethod.queen.pValue, 0.0007);
  assert.deepEqual(byMethod.queen.significantHhDongs, ['관산동']);
  assert.deepEqual(
    sorted(byMethod.queen.significantLlDongs),
    sorted(['마두1동', '장항2동', '정발산동', '주엽1동', '주엽2동']),
  );
  approx(byMethod.symmetricKnn4.moranI, 0.2479025842488755);
  approx(byMethod.symmetricKnn4.pValue, 0.0028);
  assert.deepEqual(byMethod.symmetricKnn4.significantHhDongs, []);
  approx(byMethod.symmetricKnn6.moranI, 0.1915986371091115);
  approx(byMethod.symmetricKnn6.pValue, 0.0059);
  assert.deepEqual(byMethod.symmetricKnn6.significantHhDongs, []);

  data.spatialWeights.forEach((specification) => {
    assert.equal(specification.seed, 42);
    assert.equal(specification.permutations, 9999);
    assert.equal(specification.localRows.length, 44);
    assert.equal(new Set(specification.localRows.map((row) => row.code)).size, 44);
    specification.localRows.forEach((row) => {
      assert.ok(row.neighborCount > 0);
      assert.ok(row.pRaw >= 0 && row.pRaw <= 1);
      assert.ok(row.qFdr >= 0 && row.qFdr <= 1);
      assert.equal(row.significantFdr05, row.qFdr < 0.05);
    });
  });
});

test('과거 팀 사후 대리매핑 3동 top3 중첩은 참고치로만 제공한다', () => {
  const analysis = data.overlapNull;
  assert.equal(analysis.populationSize, 44);
  assert.equal(analysis.candidateCount, 3);
  assert.equal(analysis.drawCount, 3);
  assert.equal(analysis.currentCount, 3);
  assert.equal(analysis.observedOverlap, 1);
  approx(analysis.expectedOverlap, 9 / 44);
  approx(analysis.pAtLeastObserved, 0.19510721836303233);
  assert.deepEqual(sorted(analysis.baselineTop3Dongs), sorted(['고봉동', '가좌동', '효자동']));
  assert.deepEqual(analysis.distribution.map((row) => row.overlap), [0, 1, 2, 3]);
  approx(analysis.distribution.reduce((sum, row) => sum + row.probability, 0), 1);
  approx(analysis.distribution[1].cumulativeAtLeast, analysis.pAtLeastObserved);
  assert.match(analysis.limitation, /예측력 검증이 아니라/);
});

test('수요정의·시설계층 단일축 시나리오는 후보 8개 기준을 보존한다', () => {
  const scenarios = data.constructSensitivity.scenarios;
  assert.deepEqual(scenarios.map((row) => row.scenarioId), [
    'baseline_all_hira',
    'demand_corrected_65plus',
    'demand_without_single70',
    'facility_medical_only',
    'facility_pharmacy_only',
  ]);
  assert.deepEqual(scenarios.map((row) => row.facilityCount), [1893, 1893, 1893, 1397, 496]);
  scenarios.forEach((row) => {
    assert.equal(row.intersectionCount, 8);
    assert.equal(row.jaccardVsBaseline, 1);
    assert.deepEqual(row.top8Dongs, EXPECTED_CANDIDATES);
    assert.deepEqual(row.outDongs, []);
    assert.deepEqual(row.inDongs, []);
  });
  assert.match(data.constructSensitivity.limitation, /상호작용을 검증하지 않는다/);
});

test('DSS 세 구성요소의 Pearson·Spearman·VIF와 단조중복 경고를 고정한다', () => {
  const analysis = data.dssComponentDependence;
  assert.equal(analysis.analysisId, 'dss_component_dependence_v1');
  assert.equal(analysis.pairRows.length, 3);
  assert.equal(analysis.vifRows.length, 3);
  analysis.pairRows.forEach((row) => assert.equal(row.nAreas, 44));
  analysis.vifRows.forEach((row) => {
    assert.equal(row.nAreas, 44);
    assert.ok(row.rSquaredAgainstOtherComponents >= 0 && row.rSquaredAgainstOtherComponents < 1);
    assert.ok(row.vif >= 1);
  });

  const pair = analysis.pairRows.find((row) => row.componentA === 'bus' && row.componentB === 'facility');
  assert.ok(pair);
  approx(pair.pearsonR, 0.7020115957354273);
  approx(pair.spearmanRho, 0.93107822410148);
  assert.equal(pair.highMonotonicDependenceAbsRhoGe08, true);
  assert.deepEqual(analysis.highMonotonicDependencePairs, [pair]);

  const vif = Object.fromEntries(analysis.vifRows.map((row) => [row.component, row.vif]));
  approx(vif.cag, 1.0451976065120643);
  approx(vif.bus, 2.0554332450151263);
  approx(vif.facility, 1.9944784899243957);
  assert.match(analysis.limitation, /인과·독립 검증이 아니다/);
  assert.match(analysis.limitation, /변수 삭제 규칙이 아니다/);
});

test('4개 DSS 상위 ablation의 교체·Jaccard·안정핵심 정의를 분리한다', () => {
  const analysis = data.dssAblation;
  assert.equal(analysis.analysisId, 'dss_top_level_component_ablation_v1');
  assert.equal(analysis.scenarioCount, 4);
  assert.deepEqual(analysis.scenarios.map((row) => row.scenarioId), [
    'baseline',
    'remove_bus',
    'remove_explicit_facility',
    'remove_bus_and_explicit_facility',
  ]);
  assert.deepEqual(analysis.scenarios.map((row) => row.intersectionCount), [8, 5, 5, 4]);
  approx(analysis.scenarios[0].jaccardVsBaseline, 1);
  approx(analysis.scenarios[1].jaccardVsBaseline, 5 / 11);
  approx(analysis.scenarios[2].jaccardVsBaseline, 5 / 11);
  approx(analysis.scenarios[3].jaccardVsBaseline, 1 / 3);
  assert.deepEqual(analysis.stableCoreDongs, ['고양동', '관산동', '행주동']);
  assert.deepEqual(
    analysis.conditionalBaselineDongs,
    ['가좌동', '능곡동', '송포동', '주교동', '효자동'],
  );
  assert.deepEqual(
    analysis.alternativeEntryDongs,
    ['성사2동', '일산1동', '중산1동', '행신4동'],
  );
  assert.equal(analysis.areaRows.length, 41);
  const stableRows = analysis.areaRows.filter((row) => row.stabilityClass === 'stable_core');
  assert.deepEqual(stableRows.map((row) => row.dong), ['고양동', '관산동', '행주동']);
  stableRows.forEach((row) => assert.equal(row.inclusionCount, 4));
  analysis.areaRows.forEach((row) => {
    approx(row.inclusionShare, row.inclusionCount / 4);
    assert.equal(row.includedScenarioIds.length, row.inclusionCount);
    assert.ok(row.minRank >= 1 && row.maxRank <= 41);
  });
  assert.match(analysis.limitation, /CAG 내부 시설접근성 RI는 남는다/);
  assert.match(analysis.limitation, /확률이 아니다/);
});

test('정류장 CSV의 마을노선 존재를 44동·동별 노선으로 손실 없이 스크리닝한다', () => {
  const analysis = data.villageBusScreening;
  assert.equal(analysis.analysisId, 'village_bus_static_presence_screen_v1');
  assert.equal(analysis.sourceDate, '2025-08-25');
  assert.equal(analysis.rawStopCount, 2099);
  assert.equal(analysis.insideStopCount, 2095);
  assert.equal(analysis.excludedOutsideStopCount, 4);
  assert.equal(analysis.rawRouteMentionCount, 7910);
  assert.equal(analysis.insideRouteMentionCount, 7902);
  assert.deepEqual(analysis.insideRouteTypeMentionCounts, {
    마을: 3194, 서울: 564, 시내: 4032, 시외: 112,
  });
  assert.equal(analysis.villageServingStopCount, 1632);
  approx(analysis.villageServingStopShare, 1632 / 2095);
  assert.equal(analysis.villageRouteMentionCount, 3194);
  approx(analysis.villageRouteMentionShare, 3194 / 7902);
  assert.equal(analysis.uniqueVillageRouteCount, 86);
  approx(analysis.areaMedianVillageServingStopShare, 0.8434472208057113);
  assert.equal(analysis.areaMedianUniqueVillageRouteCount, 7);
  assert.equal(analysis.areaRows.length, 44);
  assert.equal(analysis.routePresenceRows.length, 332);
  assert.equal(new Set(analysis.areaRows.map((row) => row.code)).size, 44);
  assert.equal(
    analysis.areaRows.reduce((sum, row) => sum + row.allStopCount, 0),
    analysis.insideStopCount,
  );
  assert.equal(
    analysis.routePresenceRows.reduce((sum, row) => sum + row.routeMentionCount, 0),
    analysis.villageRouteMentionCount,
  );
  analysis.areaRows.forEach((row) => {
    approx(row.villageServingStopShare, row.villageServingStopCount / row.allStopCount);
    approx(row.villageRouteMentionShare, row.villageRouteMentionCount / row.allRouteMentionCount);
    assert.equal(row.uniqueVillageRouteCount, row.villageRouteNames.length);
    assert.ok(row.villageServingStopShareAscendingRank >= 1 && row.villageServingStopShareAscendingRank <= 44);
    assert.ok(row.uniqueVillageRouteCountAscendingRank >= 1 && row.uniqueVillageRouteCountAscendingRank <= 44);
  });
  assert.match(analysis.limitation, /배차·운행횟수/);
  assert.match(analysis.limitation, /도입 우선순위로 해석하지 않는다/);
});

test('관산·행주·대화 비교표는 정확한 후보상태와 마을버스 정적 수치를 제공한다', () => {
  const analysis = data.focusComparison;
  assert.deepEqual(analysis.dongs, ['관산동', '행주동', '대화동']);
  assert.deepEqual(analysis.rows.map((row) => row.dong), analysis.dongs);
  assert.deepEqual(analysis.rows.map((row) => row.baselineCandidate), [true, true, false]);
  const byDong = Object.fromEntries(analysis.rows.map((row) => [row.dong, row]));
  assert.deepEqual(
    Object.fromEntries(analysis.dongs.map((dong) => [dong, [
      byDong[dong].allStopCount,
      byDong[dong].villageServingStopCount,
      byDong[dong].uniqueVillageRouteCount,
    ]])),
    { 관산동: [129, 127, 8], 행주동: [40, 34, 6], 대화동: [68, 53, 12] },
  );
  approx(byDong.관산동.villageServingStopShare, 127 / 129);
  approx(byDong.행주동.villageServingStopShare, 34 / 40);
  approx(byDong.대화동.villageServingStopShare, 53 / 68);
  assert.deepEqual(byDong.관산동.villageRouteNames, ['012', '025', '026', '036', '037', '055', '088', 'N005']);
  assert.deepEqual(byDong.행주동.villageRouteNames, ['011', '029B', '060', '065', '069', '072B']);
  assert.equal(byDong.관산동.globalRank, 7);
  assert.equal(byDong.행주동.globalRank, 6);
  assert.equal(byDong.대화동.globalRank, 38);
  assert.match(analysis.limitation, /통계적 대조군/);
});

test('결정적 SVG 도표는 제목·설명·핵심 한계를 포함한다', () => {
  EXPECTED_FIGURES.forEach((filename) => {
    const source = fs.readFileSync(path.join(FIGURE_DIR, filename), 'utf8');
    assert.match(source, /^<svg /);
    assert.match(source, /<title id="title">/);
    assert.match(source, /<desc id="desc">/);
    assert.doesNotMatch(source, /<image\b/);
  });
  assert.match(
    fs.readFileSync(path.join(FIGURE_DIR, '01_dss_ablation_top8.svg'), 'utf8'),
    /4\/4 안정핵심: 고양동, 관산동, 행주동/,
  );
  assert.match(
    fs.readFileSync(path.join(FIGURE_DIR, '02_focus_area_village_bus.svg'), 'utf8'),
    /배차·운행횟수·시간대·방향·환승·OD/,
  );
  assert.match(
    fs.readFileSync(path.join(FIGURE_DIR, '03_access_time_scenario.svg'), 'utf8'),
    /실제 도입 전후가 아니다/,
  );
  assert.match(
    fs.readFileSync(path.join(FIGURE_DIR, '03_access_time_scenario.svg'), 'utf8'),
    /62개 돌봄서비스와 대상자 도달률을 뜻하지 않는다/,
  );
});

test('방법론은 단순 ΔRI를 금지하고 실측 전후 승격에 필요한 데이터를 명시한다', () => {
  const report = fs.readFileSync(REPORT_PATH, 'utf8');
  assert.match(report, /RI의 단순 차이\(`ΔRI`\)는 계산하지 않고/);
  assert.match(report, /중앙 격자 손익분기 대기상한/);
  assert.match(report, /실제 62개 서비스의 좌표·서비스 유형/);
  assert.match(report, /요청·배차·픽업·도착 시각/);
  assert.match(report, /시행 전 비교기간과 비슷한 비교권역/);
  assert.match(report, /그때만 대상자 가중 도달률과 실제 전후효과를 평가한다/);
});

test('모든 CSV는 기준일·단위·식·한계·입력 SHA를 포함한다', () => {
  EXPECTED_TABLES.forEach((filename) => {
    const source = fs.readFileSync(path.join(TABLE_DIR, filename), 'utf8');
    const [header, firstDataRow] = source.split(/\r?\n/);
    const columns = header.split(',');
    REQUIRED_CSV_METADATA.forEach((column) => assert.ok(columns.includes(column), `${filename}: ${column} 누락`));
    assert.ok(firstDataRow, `${filename}에 데이터 행이 있어야 합니다.`);
    assert.match(source, /[A-F0-9]{64}/);
  });
});

test('DATA_LINEAGE의 전문분석 산출물 수와 선언 SHA가 현재 파일과 일치한다', () => {
  const lineage = fs.readFileSync(LINEAGE_PATH, 'utf8');
  const declared = lineage.match(/\[pro_analysis\.js\][^\n]*`([A-F0-9]{64})`/);
  assert.ok(declared, 'DATA_LINEAGE에 pro_analysis.js SHA-256 선언이 있어야 합니다.');
  assert.equal(declared[1], sha256(DATA_PATH));
  assert.match(lineage, /CSV 22개\(입력 manifest 1개 \+ 분석표 21개\)/);
  assert.match(lineage, /결정적 SVG 3개/);
  assert.equal(fs.readdirSync(TABLE_DIR).filter((name) => name.endsWith('.csv')).length, 22);
});

test('공개 산출물에 개인정보 키·절대경로·원자료 식별값이 노출되지 않는다', () => {
  const bannedKeys = /^(facilityId|facilityName|address|latitude|longitude|stopId|stopName|centroidX|centroidY|x5179|y5179)$/i;
  collectKeys(data).forEach((key) => assert.doesNotMatch(key, bannedKeys));
  generatedFiles().forEach((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    assert.doesNotMatch(source, /[A-Za-z]:[\\/](?![\\/])/, `${filePath}에 Windows 절대경로가 있습니다.`);
    assert.doesNotMatch(source, /(?:Users|Documents)[\\/]/i, `${filePath}에 사용자 경로가 있습니다.`);
    assert.doesNotMatch(source, /호수약국|개선스포츠|퍼스트가든/, `${filePath}에 원자료 식별값이 있습니다.`);
  });
});
