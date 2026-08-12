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

test('관객 덱은 29장(본편 17 + 부록 12)이고 발표자 대본 번들과 분리된다', () => {
  const html = read('presentation/index.html');
  const css = read('presentation/presentation.css');
  const audienceCorpus = fs.readdirSync(PRESENTATION)
    .filter((name) => fs.statSync(path.join(PRESENTATION, name)).isFile())
    .map((name) => fs.readFileSync(path.join(PRESENTATION, name), 'utf8'))
    .join('\n');

  assert.equal((html.match(/class="slide(?:\s|\")/g) || []).length, 29);
  for (let slide = 1; slide <= 29; slide += 1) {
    assert.match(html, new RegExp(`data-slide="${slide}"`));
  }
  assert.doesNotMatch(audienceCorpus, /GOYANG_PRESENTER_SCRIPT|script-data\.js|durationSeconds|transitionSeconds|demoSeconds/);
  assert.doesNotMatch(html, /말할 내용|현재 대본 복사|발표자 콘솔/);
  assert.match(html, /\.\.\/public\/data\/data\.js/);
  assert.match(html, /\.\.\/public\/data\/pro_analysis\.js/);
  assert.match(html, /\.\.\/public\/data\/welfare_destinations\.js/);
  assert.match(html, /\.\.\/public\/data\/boundaries\.js/);
  assert.match(css, /@page\s*\{\s*size:\s*1600px 900px;\s*margin:\s*0;\s*\}/);
  assertLocalReferencesExist('presentation/index.html');
});

test('관객 덱은 심사 피드백 보완 결과와 사실 경계를 함께 표시한다', () => {
  const html = read('presentation/index.html');
  // 실제자료 미확보, 지표 의존성, 기존교통, 복지 목적지, 시간 가정, DRT 단위가 모두 보여야 한다.
  const requiredClaims = [
    /약 2\.9만/, /현재 이용자 수(?:가)? 아님/, /62개 물리적 목적지(?:가)? 아님/, /전체 돌봄 대상자(?:가)? 아님/,
    /1,972/, /44개 동/, /8\s*\/\s*8|여덟 곳이 그대로 다시 나왔습니다/,
    /관산동/, /\.931/, /후보 8곳 중 3곳|3\s*\/\s*8/, /127\s*\/\s*129/, /594/, /좌표/, /99\.6/, /4권역/,
    /실제 대상자/, /서비스 위치/, /배차/, /OD/, /6단계/, /효과.*아닙니다|효과예측이 아니라/,
    /45개/, /231개/, /선정확률|확률.*아니/,
  ];
  requiredClaims.forEach((pattern) => assert.match(html, pattern));
  const fullPresentation = `${html}\n${read('presentation/slides.js')}\n${read('presenter/script-data.js')}`;
  assert.doesNotMatch(fullPresentation, /신규 예산 불필요|운행비.*절반|탄소\s*478|재입원 예방/);
  const retiredPhrases = [
    '상관계수는 아직' + ' 계산 전',
    '행주동은' + ' 본편',
    '월요일 아침,' + ' 담당자 화면',
    'MVP는 4' + '단계',
    '확정 ' + '파일럿',
  ];
  retiredPhrases.forEach((phrase) => assert.ok(!fullPresentation.includes(phrase), `구형 문구 잔존: ${phrase}`));
});

test('발표자 대본은 설명 11분대, 전환, MVP 2분을 중복 없이 분리한다', () => {
  const data = loadPresenterData();
  assert.ok(data);
  assert.equal(data.metadata.presenterCount, 1);
  assert.equal(data.metadata.slideCount, 29);
  assert.equal(data.slides.length, 29);
  assert.equal(data.metadata.talkSeconds, 670);
  assert.equal(data.metadata.appendixSeconds, 300);
  assert.equal(data.metadata.mainSlideCount, 17);
  assert.equal(data.metadata.appendixSlideCount, 12);
  assert.equal(data.metadata.transitionSeconds, 40);
  assert.equal(data.metadata.demoSeconds, 110);
  assert.equal(data.metadata.eventSeconds, 820);
  assert.equal(data.metadata.eventLimitSeconds, 900);
  assert.equal(data.metadata.insertAfterSlide, 16);
  assert.equal(data.slides.filter((s) => s.id <= 17).reduce((sum, slide) => sum + slide.durationSeconds, 0), 670);
  assert.equal(data.slides.find((slide) => slide.id === 16).demoSteps.length, 6);

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
  // 요약 칩은 대본 데이터에서 렌더한다. 시간 배분이 바뀌어도 문구가 어긋나지 않는다.
  assert.match(html, /id="summary-talk"/);
  assert.match(html, /id="summary-transition"/);
  assert.match(html, /id="summary-demo"/);
  assert.match(read('presenter/presenter.js'), /renderSessionSummary/);
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
