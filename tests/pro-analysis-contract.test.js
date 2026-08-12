const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'public', 'data', 'pro_analysis.js');

function loadAnalysis() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(DATA_PATH, 'utf8'), sandbox, { filename: DATA_PATH });
  return JSON.parse(JSON.stringify(sandbox.window.DDOL_PRO_ANALYSIS));
}

const analysis = loadAnalysis();

test('피드백 대응 전문분석 계약과 기준일을 공개 산출물에 보존한다', () => {
  assert.equal(analysis.metadata.schemaVersion, '1.2.0');
  assert.equal(analysis.metadata.generatedAt, '2026-08-13');
  assert.deepEqual(Object.keys(analysis), [
    'metadata', 'baseline', 'weightSensitivity', 'facilityCoverage', 'spatialWeights',
    'overlapNull', 'constructSensitivity', 'dssComponentDependence', 'dssAblation',
    'villageBusScreening', 'focusComparison', 'accessibilityTimeScenarios',
  ]);
  assert.equal(analysis.metadata.inputManifest.length, 8);
  assert.equal(analysis.metadata.sourceDates.busStops, '2025-08-25');
});

test('의료시설 이동시간 범위는 실제 전후효과와 분리된 3개 가정으로 공개한다', () => {
  const access = analysis.accessibilityTimeScenarios;
  assert.equal(access.effectStatus, 'hypothetical_scenario_not_observed_before_after');
  assert.deepEqual(access.waitScenarioMinutes, [5, 10, 15]);
  assert.deepEqual(access.coverageThresholdMinutes, [30, 45]);
  assert.equal(access.assumptions.fixedAccessEgressMinutes, 5);
  assert.equal(access.assumptions.networkDistanceFactor, 1.3);
  assert.equal(access.assumptions.inVehicleSpeedKmh, 15);
  assert.equal(access.assumptions.assumedTransfers, 0);
  assert.equal(access.candidateRows.length, 24);
  assert.equal(access.candidateRangeRows.length, 8);
  assert.equal(access.dataQuality.requiredFieldMissingCount, 0);
  assert.equal(access.dataQuality.duplicateGridCoordinateCount, 0);
  assert.equal(access.dataQuality.negativeDistanceCount, 0);
  assert.match(access.limitation, /실제 도입 전후·인과효과·예측값이 아니라/);
  assert.match(access.limitation, /62개 돌봄서비스 목적지가 아니고/);

  const gwansan = access.candidateRangeRows.find((row) => row.dong === '관산동');
  assert.ok(gwansan);
  assert.ok(Math.abs(gwansan.referenceCoverage30 - 0.8849230769230769) < 1e-12);
  assert.ok(Math.abs(gwansan.scenarioCoverage30Low - 0.9956923076923077) < 1e-12);
  assert.equal(gwansan.scenarioCoverage30High, 1);
  assert.ok(gwansan.medianTimeChangeMinutesLow < 0);
  assert.ok(gwansan.medianTimeChangeMinutesHigh > 0);
  assert.ok(Math.abs(gwansan.breakEvenWaitMedianMinutes - 7.182154521777173) < 1e-12);
});

test('DSS 중복성과 구성요소 제거 민감도를 정확히 공개한다', () => {
  const pair = analysis.dssComponentDependence.pairRows.find((row) => (
    row.componentA === 'bus' && row.componentB === 'facility'
  ));
  assert.ok(pair);
  assert.ok(Math.abs(pair.pearsonR - 0.7020115957354273) < 1e-12);
  assert.ok(Math.abs(pair.spearmanRho - 0.93107822410148) < 1e-12);
  assert.equal(pair.highMonotonicDependenceAbsRhoGe08, true);

  assert.deepEqual(analysis.dssAblation.stableCoreDongs, ['고양동', '관산동', '행주동']);
  assert.deepEqual(analysis.dssAblation.conditionalBaselineDongs, [
    '가좌동', '능곡동', '송포동', '주교동', '효자동',
  ]);
  const removeBus = analysis.dssAblation.scenarios.find((row) => row.scenarioId === 'remove_bus');
  const removeBoth = analysis.dssAblation.scenarios.find((row) => row.scenarioId === 'remove_bus_and_explicit_facility');
  assert.deepEqual(removeBus.outDongs, ['능곡동', '송포동', '주교동']);
  assert.equal(removeBus.jaccardVsBaseline, 5 / 11);
  assert.equal(removeBoth.outDongs.length, 4);
  assert.equal(removeBoth.jaccardVsBaseline, 1 / 3);
});

test('마을버스 정적 스크리닝과 관산·행주·대화 비교를 과장 없이 보존한다', () => {
  const bus = analysis.villageBusScreening;
  assert.equal(bus.rawStopCount, 2099);
  assert.equal(bus.insideStopCount, 2095);
  assert.equal(bus.villageServingStopCount, 1632);
  assert.equal(bus.uniqueVillageRouteCount, 86);
  assert.match(bus.limitation, /배차/);
  assert.match(bus.limitation, /OD/);

  const rows = Object.fromEntries(analysis.focusComparison.rows.map((row) => [row.dong, row]));
  assert.equal(rows.관산동.villageServingStopCount, 127);
  assert.equal(rows.관산동.allStopCount, 129);
  assert.equal(rows.관산동.uniqueVillageRouteCount, 8);
  assert.equal(rows.행주동.villageServingStopCount, 34);
  assert.equal(rows.대화동.baselineCandidate, false);
  assert.equal(rows.대화동.globalRank, 38);
});

test('전문분석 CSV 22개와 SVG 3개가 함께 배포된다', () => {
  const tableDir = path.join(ROOT, 'outputs', 'tables', 'pro_analysis');
  const figureDir = path.join(ROOT, 'outputs', 'figures', 'pro_analysis');
  assert.equal(fs.readdirSync(tableDir).filter((name) => name.endsWith('.csv')).length, 22);
  assert.deepEqual(
    fs.readdirSync(figureDir).filter((name) => name.endsWith('.svg')).sort(),
    [
      '01_dss_ablation_top8.svg',
      '02_focus_area_village_bus.svg',
      '03_access_time_scenario.svg',
    ],
  );
});
