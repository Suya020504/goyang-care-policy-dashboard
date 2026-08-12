const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');

const trace = (message) => {
  if (process.env.PRESENTATION_TEST_TRACE) process.stderr.write(`[presentation-test] ${message}\n`);
};
let activeBrowser = null;

function rootUrl(relativePath) {
  const root = path.resolve(__dirname, '..');
  if (process.env.TEST_URL) return new URL(relativePath, process.env.TEST_URL).href;
  return pathToFileURL(path.join(root, relativePath)).href;
}

async function captureErrors(page) {
  const errors = { console: [], page: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const source = message.location().url;
      if (source.endsWith('/favicon.ico')) return;
      errors.console.push(source ? `${message.text()} @ ${source}` : message.text());
    }
  });
  page.on('pageerror', (error) => errors.page.push(error.message));
  return errors;
}

async function assertNoHorizontalOverflow(page, label) {
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(width.scroll <= width.client, `${label} 가로 overflow: ${JSON.stringify(width)}`);
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath(),
  });
  activeBrowser = browser;
  trace('browser launched');
  const context = await browser.newContext();

  const audience = await context.newPage();
  audience.setDefaultTimeout(10000);
  const audienceErrors = await captureErrors(audience);
  await audience.setViewportSize({ width: 1440, height: 900 });
  await audience.goto(`${rootUrl('presentation/index.html')}?slide=1`, { waitUntil: 'load' });
  trace('audience slide 1 loaded');
  assert.equal(await audience.locator('.slide').count(), 29);
  assert.equal(await audience.locator('.slide.is-active').getAttribute('data-slide'), '1');
  assert.match(await audience.title(), /돌봄이 필요한 곳|닿지 않는 돌봄/);
  await audience.keyboard.press('ArrowRight');
  assert.equal(await audience.locator('.slide.is-active').getAttribute('data-slide'), '2');
  assert.match(audience.url(), /slide=2/);
  await audience.goto(`${rootUrl('presentation/index.html')}?slide=6`, { waitUntil: 'load' });
  trace('audience slide 6 loaded');
  assert.equal(await audience.locator('#demand-map svg path').count(), 44);
  assert.equal(await audience.locator('#facility-map svg path').count(), 44);
  await audience.goto(`${rootUrl('presentation/index.html')}?slide=7`, { waitUntil: 'load' });
  assert.equal(await audience.locator('#candidate-map svg path').count(), 44);
  await audience.goto(`${rootUrl('presentation/index.html')}?slide=9`, { waitUntil: 'load' });
  assert.match(await audience.locator('.slide.is-active').innerText(), /\.931/);
  assert.match(await audience.locator('.slide.is-active').innerText(), /후보 8곳 중 3곳|3\s*\/\s*8/);
  assert.equal(await audience.locator('#dependence-chart').count(), 1);
  assert.equal(await audience.locator('#ablation-chart').count(), 1);
  await audience.goto(`${rootUrl('presentation/index.html')}?slide=10`, { waitUntil: 'load' });
  assert.match(await audience.locator('.slide.is-active').innerText(), /127\s*\/\s*129/);
  await audience.goto(`${rootUrl('presentation/index.html')}?slide=11`, { waitUntil: 'load' });
  assert.match(await audience.locator('.slide.is-active').innerText(), /11/);
  assert.match(await audience.locator('.slide.is-active').innerText(), /4\s*\/\s*8/);
  assert.match(await audience.locator('.slide.is-active').innerText(), /관산동 후보 유지/);
  assert.match(await audience.locator('.slide.is-active').innerText(), /11\s*\/\s*11/);
  assert.equal(await audience.locator('#welfare-chart svg').count(), 1);
  assert.match(
    await audience.locator('.slide.is-active').innerText(),
    /실제 62개 서비스 접근성.*아님/,
  );
  await audience.goto(`${rootUrl('presentation/index.html')}?slide=12`, { waitUntil: 'load' });
  assert.match(await audience.locator('.slide.is-active').innerText(), /효과가 아니라|효과예측이 아니라/);
  await audience.goto(`${rootUrl('presentation/index.html')}?slide=13`, { waitUntil: 'load' });
  assert.match(await audience.locator('.slide.is-active').innerText(), /4권역/);
  await assertNoHorizontalOverflow(audience, '관객 덱 1440px');
  await audience.screenshot({ path: path.join(root, 'screenshots', '18_피드백발표_데스크톱.png'), fullPage: false });
  trace('audience desktop screenshot saved');

  await audience.setViewportSize({ width: 390, height: 844 });
  await audience.goto(`${rootUrl('presentation/index.html')}?slide=16`, { waitUntil: 'load' });
  await assertNoHorizontalOverflow(audience, '관객 덱 390px');
  assert.match(await audience.locator('.slide.is-active').innerText(), /6단계/);
  await audience.screenshot({ path: path.join(root, 'screenshots', '19_피드백발표_MVP_모바일.png'), fullPage: false });
  trace('audience mobile screenshot saved');
  assert.deepEqual(audienceErrors.page, []);
  assert.deepEqual(audienceErrors.console, []);

  const presenter = await context.newPage();
  presenter.setDefaultTimeout(10000);
  const presenterErrors = await captureErrors(presenter);
  await presenter.setViewportSize({ width: 1440, height: 900 });
  await presenter.goto(`${rootUrl('presenter/index.html')}?slide=1`, { waitUntil: 'load' });
  trace('presenter slide 1 loaded');
  assert.match(await presenter.title(), /발표자 화면/);
  assert.match(await presenter.locator('#slide-number').innerText(), /01 \/ 29/);
  assert.equal(await presenter.locator('#slide-picker option').count(), 29);
  assert.match(await presenter.locator('#script-copy').innerText(), /안녕하세요, 팀 도달입니다/);
  assert.match(await presenter.locator('#script-copy').innerText(), /확인한 공개자료/);
  assert.match(await presenter.locator('#slide-preview').getAttribute('src'), /presentation.*slide=1.*presenter=1/);
  const previewFrame = presenter.frameLocator('#slide-preview');
  assert.equal(await previewFrame.locator('.slide').count(), 29);
  assert.equal(await previewFrame.locator('.slide.is-active').getAttribute('data-slide'), '1');
  await presenter.locator('#slide-picker').selectOption('16');
  await previewFrame.locator('.slide.is-active[data-slide="16"]').waitFor();
  assert.equal(await previewFrame.locator('.slide.is-active').getAttribute('data-slide'), '16');
  trace('presenter iframe synchronized to slide 16');
  assert.equal(await presenter.locator('#demo-steps li').count(), 6);
  // 시연 장의 설명 25초와 실제 MVP 시연 110초는 별도 계상한다.
  assert.match(await presenter.locator('#slide-duration').innerText(), /0:25/);
  await presenter.locator('#next-button').click();
  await previewFrame.locator('.slide.is-active[data-slide="17"]').waitFor();
  await presenter.waitForTimeout(700);
  assert.match(await presenter.locator('#slide-number').innerText(), /17 \/ 29/);
  assert.equal(await previewFrame.locator('.slide.is-active').getAttribute('data-slide'), '17');
  // 시간은 대본 데이터에서 계산해 대조한다. 배분이 바뀌어도 검사가 따라간다.
  const expected = await presenter.evaluate(() => {
    const d = window.GOYANG_PRESENTER_SCRIPT;
    const upTo = d.slides.filter((s) => s.id <= 17).reduce((a, s) => a + s.durationSeconds, 0);
    const fmt = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
    // 17번은 시연 장(16번)을 지난 뒤라 전환과 시연 시간이 모두 경과했다.
    const past = d.metadata.transitionSeconds + d.metadata.demoSeconds;
    return { talk: fmt(upTo), event: fmt(upTo + past) };
  });
  assert.equal(await presenter.locator('#talk-elapsed').innerText(), expected.talk);
  assert.equal(await presenter.locator('#event-elapsed').innerText(), expected.event);
  await assertNoHorizontalOverflow(presenter, '발표자 화면 1440px');
  await presenter.screenshot({ path: path.join(root, 'screenshots', '12_발표자화면_데스크톱.png'), fullPage: false });
  trace('presenter desktop screenshot saved');

  await presenter.setViewportSize({ width: 390, height: 844 });
  await presenter.goto(`${rootUrl('presenter/index.html')}?slide=16`, { waitUntil: 'load' });
  await assertNoHorizontalOverflow(presenter, '발표자 화면 390px');
  assert.equal(await presenter.locator('#demo-steps li').count(), 6);
  await presenter.screenshot({ path: path.join(root, 'screenshots', '21_피드백발표자_모바일.png'), fullPage: true });
  trace('presenter mobile screenshot saved');
  assert.deepEqual(presenterErrors.page, []);
  assert.deepEqual(presenterErrors.console, []);

  await browser.close();
  activeBrowser = null;
  trace('browser closed');
  process.stdout.write(JSON.stringify({
    result: 'PASS',
    audienceSlides: 29,
    mapFeatures: 44,
    presenterTalkSeconds: 670,
    transitionSeconds: 40,
    demoSeconds: 110,
    viewports: ['1440x900', '390x844'],
  }, null, 2));
}

main().catch(async (error) => {
  await activeBrowser?.close();
  activeBrowser = null;
  trace('browser closed after failure');
  console.error(error);
  process.exitCode = 1;
});
