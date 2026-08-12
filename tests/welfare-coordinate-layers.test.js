const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');


const DATA_PATH = path.join(
  __dirname,
  '..',
  'public',
  'data',
  'welfare_coordinate_layers.js',
);

function loadCoordinateLayers() {
  const source = fs.readFileSync(DATA_PATH, 'utf8');
  assert.doesNotMatch(
    source.toLowerCase(),
    /tel|phone|fax|contact|contct/,
    '공개 파일에 연락처 필드가 포함되면 안 됩니다.',
  );
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: DATA_PATH });
  assert.ok(
    sandbox.window.DDOL_WELFARE_COORDINATE_LAYERS,
    '공개 복지좌표 데이터가 window에 생성되어야 합니다.',
  );
  return JSON.parse(JSON.stringify(sandbox.window.DDOL_WELFARE_COORDINATE_LAYERS));
}

const data = loadCoordinateLayers();

test('공개 좌표는 개인정보 없는 598점과 허용 필드만 제공한다', () => {
  assert.equal(data.points.length, 598);
  const allowedKeys = [
    'adminDong',
    'id',
    'latitude',
    'longitude',
    'serviceType',
    'sourceReferenceDate',
  ].sort();
  data.points.forEach((point) => {
    assert.deepEqual(Object.keys(point).sort(), allowedKeys);
    assert.match(point.id, /^(sen|eld)_[0-9a-f]{16}$/);
    assert.ok(point.latitude >= 37.4 && point.latitude <= 37.9);
    assert.ok(point.longitude >= 126.5 && point.longitude <= 127.0);
  });

  const counts = Object.create(null);
  data.points.forEach((point) => {
    counts[point.serviceType] = (counts[point.serviceType] || 0) + 1;
  });
  assert.deepEqual(
    { ...counts },
    { senior_center: 585, senior_welfare_center: 3, elder_care_provider: 10 },
  );
});

test('44동 x 3개 서로 다른 복지계층의 132행 계약을 지킨다', () => {
  assert.equal(data.areaAccessibility.length, 132);
  assert.equal(new Set(data.areaAccessibility.map((row) => row.adminDong)).size, 44);
  assert.deepEqual(
    [...new Set(data.areaAccessibility.map((row) => row.serviceLayer))].sort(),
    ['elder_care_providers', 'senior_centers', 'senior_welfare_centers'],
  );
  assert.match(data.metadata.criticalDisclaimer, /62개.*동일시하지 않음/);
});

test('엄격 연결과 관산동 안정값을 회귀 고정한다', () => {
  assert.deepEqual(
    {
      exact: data.metadata.linkage.exact_matches,
      normalized: data.metadata.linkage.normalized_matches,
      manual: data.metadata.linkage.manual_review,
      unmatched: data.metadata.linkage.unmatched,
      linked: data.metadata.linkage.linked_total,
      coordinateComplete: data.metadata.linkage.coordinate_complete,
    },
    {
      exact: 157,
      normalized: 418,
      manual: 7,
      unmatched: 12,
      linked: 575,
      coordinateComplete: 570,
    },
  );

  const gwansan = data.areaAccessibility.find(
    (row) => row.serviceLayer === 'senior_centers' && row.adminDong === '관산동',
  );
  assert.ok(gwansan);
  assert.equal(gwansan.facilityCountInsideDong, 16);
  assert.equal(gwansan.nearestMedianM, 513.879);
  assert.equal(gwansan.coverage15MinPct, 76.738);
});

test('원천 무결성과 좌표 미완성 후보군 편향 감사를 공개한다', () => {
  assert.equal(data.metadata.counts.seniorCenterValidCoordinates, 585);
  assert.equal(data.metadata.sourceIntegrity.length, 4);
  data.metadata.sourceIntegrity.forEach((source) => {
    assert.match(source.sha256, /^[A-F0-9]{64}$/);
  });
  const audit = Object.fromEntries(
    data.metadata.coordinateMissingnessAudit.map((row) => [row.group, row]),
  );
  assert.equal(audit.baseline_candidate_8.workbook_records, 118);
  assert.equal(audit.baseline_candidate_8.coordinate_missing_records, 5);
  assert.equal(audit.non_candidate_36.workbook_records, 476);
  assert.equal(audit.non_candidate_36.coordinate_missing_records, 19);
  assert.equal(audit.all_44_dongs.coordinate_complete_records, 570);
  assert.equal(audit.baseline_candidate_8.fisher_exact_two_sided_p, 0.8);
});
