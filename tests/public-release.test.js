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

test('공개 복지 목적지 집계는 44동·594행이며 좌표 미확보를 명시한다', () => {
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
