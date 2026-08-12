const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');


const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'public', 'data', 'welfare_destination_sensitivity.js');
const TABLE_DIR = path.join(ROOT, 'outputs', 'tables', 'welfare_destination_sensitivity');

function loadSensitivity() {
  const source = fs.readFileSync(DATA_PATH, 'utf8');
  assert.doesNotMatch(
    source.toLowerCase(),
    /facility_name|road_address|lot_address|phone|tel|fax|contact/,
    '공개 민감도 파일에 시설 식별·연락 필드가 있으면 안 됩니다.',
  );
  assert.doesNotMatch(source, /[A-Za-z]:\\|\/Users\/|\\Users\\/);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: DATA_PATH });
  assert.ok(sandbox.window.DDOL_WELFARE_DESTINATION_SENSITIVITY);
  return JSON.parse(JSON.stringify(sandbox.window.DDOL_WELFARE_DESTINATION_SENSITIVITY));
}

const data = loadSensitivity();

test('베이스라인 1개와 복지 치환 11개를 부분·완전 치환으로 분리한다', () => {
  assert.equal(data.scenarios.length, 12);
  assert.equal(data.focusAreas.length, 12 * 3);
  assert.equal(data.candidateStability.length, 44);
  assert.equal(data.metadata.gridCount, 26_595);
  assert.equal(data.metadata.adminDongCount, 44);
  assert.equal(data.metadata.betaPerMin, 0.1);
  assert.equal(data.metadata.walkingSpeedMps, 0.8);
  assert.equal(data.metadata.dataQuality.length, 10);
  assert.ok(data.metadata.dataQuality.every((row) => row.passed));
  assert.match(data.metadata.partialReplacement, /명시적 시설분산 항만/);
  assert.match(data.metadata.fullReplacement, /CAG의 RI.*모두/);
});

test('핵심 Top8 민감도와 관산동 안정성을 회귀 고정한다', () => {
  const byId = Object.fromEntries(data.scenarios.map((row) => [row.scenario_id, row]));
  const expected = {
    partial_senior_centers: [1, 0],
    full_senior_centers: [0.6, 2],
    partial_senior_welfare_centers: [7 / 9, 1],
    full_senior_welfare_centers: [1 / 3, 4],
    partial_elder_care_providers: [0.6, 2],
    full_elder_care_providers: [1 / 3, 4],
    full_combined_record_equal: [0.6, 2],
    full_combined_layer_equal: [0.6, 2],
  };
  Object.entries(expected).forEach(([id, [jaccard, replacements]]) => {
    assert.ok(byId[id], `${id} 시나리오 누락`);
    assert.ok(Math.abs(byId[id].jaccard_vs_baseline_top8 - jaccard) < 1e-6);
    assert.equal(byId[id].replacement_count, replacements);
  });

  const stableCore = data.candidateStability
    .filter((row) => row.stable_all_scenarios)
    .map((row) => row.dong_name)
    .sort();
  assert.deepEqual(stableCore, ['가좌동', '고양동', '관산동', '효자동'].sort());
  const gwansan = data.focusAreas.filter(
    (row) => row.dong_name === '관산동' && row.scenario_id !== 'baseline_medical',
  );
  assert.equal(gwansan.length, 11);
  assert.ok(gwansan.every((row) => row.top8_eligible));
});

test('경로당 585건과 최신 594행 중 좌표완성 570행을 별도 비교한다', () => {
  const byId = Object.fromEntries(data.scenarios.map((row) => [row.scenario_id, row]));
  assert.equal(byId.partial_senior_centers.facility_record_count, 585);
  assert.equal(
    byId.partial_senior_centers_latest_linked_570.facility_record_count,
    570,
  );
  assert.equal(data.seniorCenterVersionComparison.length, 6);
  assert.ok(
    data.seniorCenterVersionComparison.every(
      (row) => row.latest_workbook_rows === 594
        && row.latest_coordinate_complete_count === 570
        && row.latest_coordinate_incomplete_count === 24
        && row.top8_jaccard_public585_vs_linked570 === 1,
    ),
  );
  assert.match(data.metadata.seniorCenterVersionBoundary, /585건.*570행.*24행/);
});

test('입력 SHA·누수 통제·공식 62개 서비스 비동일성을 공개한다', () => {
  assert.equal(data.metadata.inputIntegrity.length, 6);
  data.metadata.inputIntegrity.forEach((input) => {
    assert.match(input.sha256, /^[A-F0-9]{64}$/);
  });
  assert.match(data.metadata.evidenceBoundary, /62개 서비스/);
  assert.match(data.metadata.leakageControl, /candidate_top8.*점수 입력에 사용하지 않음/);
  assert.match(data.metadata.eligibilityBoundary, /과거 팀의 사후 대리매핑/);
});

test('공개 표·보고서에 개인정보·절대경로가 없다', () => {
  const expectedFiles = [
    'scenario_summary.csv',
    'rank_detail.csv',
    'focus_area_comparison.csv',
    'candidate_stability.csv',
    'senior_center_version_comparison.csv',
    'input_manifest.csv',
    'data_dictionary.csv',
    'analysis_quality.csv',
    'method_spec.json',
  ];
  expectedFiles.forEach((file) => assert.ok(fs.existsSync(path.join(TABLE_DIR, file)), file));
  const text = expectedFiles
    .map((file) => fs.readFileSync(path.join(TABLE_DIR, file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(
    text.toLowerCase(),
    /facility_name|road_address|lot_address|phone|tel|fax|contact/,
  );
  assert.doesNotMatch(text, /[A-Za-z]:\\|\/Users\/|\\Users\\/);
  const report = fs.readFileSync(
    path.join(ROOT, 'reports', 'WELFARE_DESTINATION_SENSITIVITY.md'),
    'utf8',
  );
  assert.match(report, /공식 고양온돌 62개 서비스/);
  assert.match(report, /24행의 좌표 미완성/);
  assert.doesNotMatch(report, /[A-Za-z]:\\|\/Users\/|\\Users\\/);
});
