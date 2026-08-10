const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const PRESENTATION = path.join(ROOT, 'presentation');
const PRESENTER = path.join(ROOT, 'presenter');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assertLocalReferencesExist(htmlPath) {
  const absoluteHtmlPath = path.join(ROOT, htmlPath);
  const directory = path.dirname(absoluteHtmlPath);
  const html = fs.readFileSync(absoluteHtmlPath, 'utf8');
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1].replace(/&amp;/g, '&'))
    .filter((ref) => !ref.startsWith('#') && !ref.startsWith('data:') && !/^https?:/i.test(ref))
    .map((ref) => ref.split(/[?#]/)[0])
    .filter(Boolean);

  references.forEach((reference) => {
    assert.ok(fs.existsSync(path.resolve(directory, reference)), `${htmlPath} 누락 참조: ${reference}`);
  });
}

function loadPresenterData() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read('presenter/script-data.js'), sandbox, { filename: 'script-data.js' });
  return JSON.parse(JSON.stringify(sandbox.window.GOYANG_PRESENTER_SCRIPT));
}

test('관객 덱은 15장이고 발표자 대본 번들과 분리된다', () => {
  const html = read('presentation/index.html');
  const css = read('presentation/presentation.css');
  const audienceCorpus = fs.readdirSync(PRESENTATION)
    .filter((name) => fs.statSync(path.join(PRESENTATION, name)).isFile())
    .map((name) => fs.readFileSync(path.join(PRESENTATION, name), 'utf8'))
    .join('\n');

  assert.equal((html.match(/class="slide(?:\s|\")/g) || []).length, 15);
  for (let slide = 1; slide <= 15; slide += 1) {
    assert.match(html, new RegExp(`data-slide="${slide}"`));
  }
  assert.doesNotMatch(audienceCorpus, /GOYANG_PRESENTER_SCRIPT|script-data\.js|durationSeconds|transitionSeconds|demoSeconds/);
  assert.doesNotMatch(html, /말할 내용|현재 대본 복사|발표자 콘솔/);
  assert.match(html, /\.\.\/public\/data\/data\.js/);
  assert.match(html, /\.\.\/public\/data\/pro_analysis\.js/);
  assert.match(html, /\.\.\/public\/data\/boundaries\.js/);
  assert.match(css, /@page\s*\{\s*size:\s*1600px 900px;\s*margin:\s*0;\s*\}/);
  assertLocalReferencesExist('presentation/index.html');
});

test('관객 덱은 제출안과 재검증의 핵심 경계를 함께 표시한다', () => {
  const html = read('presentation/index.html');
  const requiredClaims = [
    /약 2\.9만/, /현재 이용자 수가 아님/, /62개 물리적 목적지가 아님/, /1,972/, /44개 동/,
    /8\s*\/\s*8/, /점수·세부 순위/, /29개 주장/, /45개/, /0\.455/, /231개/, /0\.333/,
    /고양동만/, /관산동/, /자동 추천이 아닙니다/, /중단조건/,
  ];
  requiredClaims.forEach((pattern) => assert.match(html, pattern));
  assert.match(html, /행정동별 세대수/);
  assert.match(read('presentation/slides.js'), /35,295세대/);
  assert.doesNotMatch(read('presentation/slides.js'), /1인세대[^\n<]*\d(?:[^\n<]{0,40})명/);
  assert.match(html, /취약 High-High 군집/);
  assert.doesNotMatch(html, /신규 예산 불필요|운행비.*절반|탄소\s*478|재입원 예방/);
});

test('발표자 대본은 12분 발표와 전환 1분, MVP 2분을 정확히 분리한다', () => {
  const data = loadPresenterData();
  assert.ok(data);
  assert.equal(data.metadata.presenterCount, 1);
  assert.equal(data.metadata.slideCount, 15);
  assert.equal(data.slides.length, 15);
  assert.equal(data.metadata.talkSeconds, 720);
  assert.equal(data.metadata.transitionSeconds, 60);
  assert.equal(data.metadata.demoSeconds, 120);
  assert.equal(data.metadata.eventSeconds, 900);
  assert.equal(data.metadata.insertAfterSlide, 14);
  assert.equal(data.slides.reduce((sum, slide) => sum + slide.durationSeconds, 0), 720);
  assert.equal(data.slides.find((slide) => slide.id === 14).demoSteps.length, 4);

  data.slides.forEach((slide, index) => {
    assert.equal(slide.id, index + 1);
    assert.ok(slide.title && slide.claim && slide.script && slide.caution && slide.transition);
    assert.ok(Array.isArray(slide.evidence) && slide.evidence.length > 0);
    assert.ok(slide.durationSeconds > 0);
  });
});

test('발표자 화면은 관객 덱 URL과 분리 대본을 함께 사용한다', () => {
  const html = read('presenter/index.html');
  assert.match(html, /src="\.\.\/presentation\/index\.html\?slide=1&amp;presenter=1"/);
  assert.match(html, /script-data\.js/);
  assert.match(html, /presenter\.js/);
  assert.match(html, /본 발표 12분/);
  assert.match(html, /전환 1분/);
  assert.match(html, /MVP 2분/);
  assert.match(html, /id="slide-preview"/);
  assert.match(html, /id="script-copy"/);
  assert.match(html, /id="demo-cue"/);
  assert.match(read('presenter/presenter.js'), /expectedIframeSlide/);
  assertLocalReferencesExist('presenter/index.html');
});

test('공개 브라우저 검사는 잠긴 playwright-core 계약을 사용한다', () => {
  const packageJson = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const vercel = JSON.parse(read('vercel.json'));
  assert.equal(packageJson.devDependencies['playwright-core'], '1.62.0');
  assert.equal(lock.packages['node_modules/playwright-core'].version, '1.62.0');
  assert.match(read('tests/browser-smoke.js'), /require\('playwright-core'\)/);
  assert.match(read('tests/presentation-browser.js'), /require\('playwright-core'\)/);
  assert.equal(vercel.cleanUrls, false, 'HTML 상대 경로를 보존하려면 Vercel cleanUrls를 끈다');
});
