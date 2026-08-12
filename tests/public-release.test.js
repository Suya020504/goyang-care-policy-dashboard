const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.json', '.md', '.py', '.ps1', '.csv']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.vercel', 'tmp', '.tmp', '.claude', 'screenshots']);

function textFiles(directory, results = []) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    if (SKIP_DIRS.has(entry.name)) return;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) textFiles(fullPath, results);
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) results.push(fullPath);
  });
  return results;
}

function loadWindowData(filePath, globalName) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), sandbox, { filename: filePath });
  return JSON.parse(JSON.stringify(sandbox.window[globalName]));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

test('공개 저장소 텍스트에 사용자 절대경로·비밀값·개인 연락처가 없다', () => {
  const corpus = textFiles(ROOT)
    .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    .join('\n');
  // 예외를 두지 않는다. 사용자명을 규칙에 박으면 그 이름이 공개되고, 가드에도 구멍이 생긴다.
  assert.doesNotMatch(corpus, /[A-Za-z]:[\\/]+Users[\\/]+/i);
  assert.doesNotMatch(corpus, /\/(?:Users|home)\/[^/\s]+/i);
  assert.doesNotMatch(corpus, /(?:gho_|ghp_|github_pat_|AKIA)[A-Za-z0-9_\-]+/);
  assert.doesNotMatch(corpus, /[A-Za-z0-9._%+-]+@(gmail|naver|kakao)\.(com|net)/i);
  assert.doesNotMatch(corpus, /\b010[- ]\d{3,4}[- ]\d{4}\b/);
});

test('HTML 실행 의존성이 저장소에 모두 존재한다', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((ref) => !ref.startsWith('#') && !ref.startsWith('data:') && !/^https?:/.test(ref));
  refs.forEach((ref) => assert.ok(fs.existsSync(path.join(ROOT, ref)), `누락 파일: ${ref}`));
});

test('공개 복지 목적지는 최신 594행 목록과 비식별 공개좌표 대리층을 분리한다', () => {
  const welfare = loadWindowData(
    path.join(ROOT, 'public', 'data', 'welfare_destinations.js'),
    'DDOL_WELFARE_DESTINATIONS',
  );
  assert.equal(welfare.areaRows.length, 44);
  assert.equal(welfare.areaRows.reduce((sum, row) => sum + row.seniorCenterCount, 0), 594);
  assert.equal(welfare.metadata.currentWebDisplayedTotal, 593);
  assert.equal(welfare.metadata.workbookRecordCount, 594);
  assert.equal(welfare.metadata.coordinateCount, 0);
  assert.equal(welfare.metadata.coordinateStatus, 'juso_confm_key_required');
  assert.equal(welfare.areaRows.find((row) => row.dong === '관산동').seniorCenterCount, 16);

  const coordinates = loadWindowData(
    path.join(ROOT, 'public', 'data', 'welfare_coordinate_layers.js'),
    'DDOL_WELFARE_COORDINATE_LAYERS',
  );
  assert.equal(coordinates.metadata.counts.seniorCenters, 591);
  assert.equal(coordinates.metadata.counts.seniorCenterValidCoordinates, 585);
  assert.equal(coordinates.points.filter((point) => point.serviceType === 'senior_center').length, 585);
  assert.equal(coordinates.points.length, 598);
  assert.equal(coordinates.areaAccessibility.length, 132);
  const gwansan = coordinates.areaAccessibility.find(
    (row) => row.serviceLayer === 'senior_centers' && row.adminDong === '관산동',
  );
  assert.equal(gwansan.facilityCountInsideDong, 16);
  assert.equal(gwansan.nearestMedianM, 513.879);
  assert.equal(gwansan.coverage15MinPct, 76.738);
  assert.match(coordinates.metadata.criticalDisclaimer, /62개 서비스 위치가 아니며/);

  const missingnessRows = parseCsv(fs.readFileSync(
    path.join(ROOT, 'outputs', 'tables', 'welfare_coordinate_missingness_audit.csv'),
    'utf8',
  ));
  assert.equal(missingnessRows.length - 1, 3);
  const missingnessHeaders = missingnessRows[0].map((header) => header.replace(/^\uFEFF/, ''));
  const missingnessRecords = missingnessRows.slice(1).map((values) => Object.fromEntries(
    missingnessHeaders.map((header, index) => [header, values[index]]),
  ));
  const candidateMissingness = missingnessRecords.find(
    (row) => row.group === 'baseline_candidate_8',
  );
  assert.equal(candidateMissingness.workbook_records, '118');
  assert.equal(candidateMissingness.coordinate_missing_records, '5');
  assert.equal(candidateMissingness.fisher_exact_two_sided_p, '0.8');
});

test('공개 마을버스 보완은 계획 배차 후보와 현행 운행을 분리한다', () => {
  const bus = loadWindowData(
    path.join(ROOT, 'public', 'data', 'bus_network_evidence.js'),
    'DDOL_BUS_NETWORK_EVIDENCE',
  );
  const summary = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'outputs', 'tables', 'bus_network_evidence', 'analysis_summary.json'),
    'utf8',
  ));
  assert.equal(bus.headway.localVillageRouteDenominator, 86);
  assert.equal(bus.headway.officialRouteNumberCandidates, 82);
  assert.equal(bus.headway.uniqueOfficialRows, 72);
  assert.equal(bus.headway.multipleOfficialRows, 10);
  assert.equal(bus.headway.unresolvedNoCandidate, 4);
  assert.deepEqual(bus.headway.unresolvedRoutes, ['15-1(구파발)', '15-1(지축)', '15A', '15B']);
  assert.equal(bus.historicalBms.linkedRoutes, 7);
  assert.equal(bus.historicalBms.linkedRouteStopRows, 56);
  assert.equal(bus.historicalBms.uniqueCoordinateLocations, 47);
  assert.match(bus.headway.interpretation, /실제 운행준수율/);
  assert.match(bus.historicalBms.interpretation, /현행 노선형상/);
  assert.equal(bus.metadata.analysisId, summary.analysisId);
  assert.equal(bus.headway.localVillageRouteDenominator, summary.headway.routeDenominator);
  assert.equal(bus.headway.officialRouteNumberCandidates, summary.headway.routeNumberCandidateCoverage);
  assert.equal(bus.headway.uniqueOfficialRows, summary.headway.matchedUnique);
  assert.equal(bus.headway.multipleOfficialRows, summary.headway.matchedMultipleCandidates);
  assert.equal(bus.headway.unresolvedNoCandidate, summary.headway.unresolvedNoCandidate);
  assert.equal(bus.headway.officialRowCount, summary.headway.officialRowCount);
  assert.equal(bus.headway.officialUniqueRouteNumberCount, summary.headway.officialUniqueRouteNumberCount);
  assert.equal(bus.historicalBms.linkedRoutes, summary.bms.linkedUniqueRouteId);
  assert.equal(bus.historicalBms.linkedRouteStopRows, summary.bms.linkedCoordinatePoints);
  assert.equal(bus.historicalBms.uniqueCoordinateLocations, summary.bms.linkedUniqueCoordinateLocations);
  assert.equal(summary.interpretationBoundary.drtOperations, 'not_acquired');

  const pointRows = parseCsv(fs.readFileSync(
    path.join(ROOT, 'outputs', 'tables', 'bus_network_evidence', 'bms_linked_stop_points.csv'),
    'utf8',
  ));
  const publicPointHeaders = pointRows[0].map((header) => header.replace(/^\uFEFF/, ''));
  ['routeId', 'stopId', 'stopName'].forEach((field) => {
    assert.ok(!publicPointHeaders.includes(field), `공개 BMS 좌표표에 식별 열이 남았습니다: ${field}`);
  });
  assert.equal(pointRows.length - 1, 56);
});

test('공개 GIS는 허용된 2026-04-01 경계와 출처표시를 사용한다', () => {
  const boundaries = loadWindowData(
    path.join(ROOT, 'public', 'data', 'boundaries.js'),
    'DDOL_V2_BOUNDARIES',
  );
  assert.equal(boundaries.metadata.analysisBoundaryAsOf, '2026-04-01');
  assert.equal(boundaries.metadata.sourceSha256, '6A63D079BA8AF4701AB200AD0B54EBDEA8689808B6E0E9F17973B9BA7883DC6A');
  assert.match(boundaries.metadata.source, /admdongkor/);
  assert.match(boundaries.metadata.licenseStatus, /CC BY 4\.0/);
  assert.match(boundaries.metadata.licenseStatus, /공공누리 제1유형/);
  assert.equal(boundaries.metadata.displayOnly, false);
});

test('계보에 선언한 공개 산출물 SHA-256은 실제 파일과 같다', () => {
  const lineage = fs.readFileSync(path.join(ROOT, 'reports', 'DATA_LINEAGE.md'), 'utf8');
  const artifacts = [
    ['data.js', path.join(ROOT, 'public', 'data', 'data.js')],
    ['boundaries.js', path.join(ROOT, 'public', 'data', 'boundaries.js')],
    ['pro_analysis.js', path.join(ROOT, 'public', 'data', 'pro_analysis.js')],
  ];
  artifacts.forEach(([name, filePath]) => {
    const match = lineage.match(new RegExp(`${name.replace('.', '\\\.')}[^\\n]*?\\x60([A-F0-9]{64})\\x60`));
    assert.ok(match, `${name} 계보 해시가 없습니다.`);
    assert.equal(match[1], sha256(filePath), `${name} 계보 해시가 실제 파일과 다릅니다.`);
  });
});

test('공개 포스터 주장 원장은 29개 주장과 판정 집계를 보존한다', () => {
  const rows = parseCsv(
    fs.readFileSync(path.join(ROOT, 'outputs', 'tables', 'poster_claim_comparison.csv'), 'utf8'),
  );
  const headers = rows[0];
  const requiredHeaders = [
    'claim_id',
    'claim',
    'poster_value',
    'reproduced_value',
    'status',
    'evidence_level',
    'note',
    'status_group',
  ];
  requiredHeaders.forEach((header) => assert.ok(headers.includes(header), `필수 열 누락: ${header}`));

  const records = rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index]]),
  ));
  assert.equal(records.length, 29);

  const statusCounts = records.reduce((counts, record) => {
    counts[record.status_group] = (counts[record.status_group] || 0) + 1;
    return counts;
  }, {});
  assert.deepEqual(statusCounts, {
    '재현/확인': 7,
    조건부: 9,
    '수정·명세 보완': 13,
  });
});
