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
  assert.equal(await audience.locator('.slide').count(), 15);
  assert.equal(await audience.locator('.slide.is-active').getAttribute('data-slide'), '1');
  assert.match(await audience.title(), /닿지 않는 돌봄/);
  await audience.keyboard.press('ArrowRight');
  assert.equal(await audience.locator('.slide.is-active').getAttribute('data-slide'), '2');
  assert.match(audience.url(), /slide=2/);
  await audience.goto(`${rootUrl('presentation/index.html')}?slide=6`, { waitUntil: 'load' });
  trace('audience slide 6 loaded');
  assert.equal(await audience.locator('#single-map svg path').count(), 44);
  assert.equal(await audience.locator('#distance-map svg path').count(), 44);
  await audience.goto(`${rootUrl('presentation/index.html')}?slide=7`, { waitUntil: 'load' });
  assert.match(await audience.locator('.slide.is-active').innerText(), /8\s*\/\s*8/);
  await audience.goto(`${rootUrl('presentation/index.html')}?slide=11`, { waitUntil: 'load' });
  trace('audience slide 11 loaded');
  assert.match(await audience.locator('.slide.is-active').innerText(), /231개/);
  assert.match(await audience.locator('.slide.is-active').innerText(), /0\.333/);
  await assertNoHorizontalOverflow(audience, '관객 덱 1440px');
  await audience.screenshot({ path: path.join(root, 'screenshots', '10_발표자료_경계감사_데스크톱.png'), fullPage: false });
  trace('audience desktop screenshot saved');

  await audience.setViewportSize({ width: 390, height: 844 });
  await audience.goto(`${rootUrl('presentation/index.html')}?slide=14`, { waitUntil: 'load' });
  await assertNoHorizontalOverflow(audience, '관객 덱 390px');
  await audience.screenshot({ path: path.join(root, 'screenshots', '11_발표자료_MVP_모바일.png'), fullPage: false });
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
  assert.match(await presenter.locator('#slide-number').innerText(), /01 \/ 15/);
  assert.equal(await presenter.locator('#slide-picker option').count(), 15);
  assert.match(await presenter.locator('#script-copy').innerText(), /안녕하세요, 팀 도달입니다/);
  assert.match(await presenter.locator('#slide-preview').getAttribute('src'), /presentation.*slide=1.*presenter=1/);
  const previewFrame = presenter.frameLocator('#slide-preview');
  assert.equal(await previewFrame.locator('.slide').count(), 15);
  assert.equal(await previewFrame.locator('.slide.is-active').getAttribute('data-slide'), '1');
  await presenter.locator('#slide-picker').selectOption('14');
  await previewFrame.locator('.slide.is-active[data-slide="14"]').waitFor();
  assert.equal(await previewFrame.locator('.slide.is-active').getAttribute('data-slide'), '14');
  trace('presenter iframe synchronized to slide 14');
  assert.equal(await presenter.locator('#demo-steps li').count(), 4);
  assert.match(await presenter.locator('#slide-duration').innerText(), /0:/);
  await presenter.locator('#next-button').click();
  await previewFrame.locator('.slide.is-active[data-slide="15"]').waitFor();
  await presenter.waitForTimeout(700);
  assert.match(await presenter.locator('#slide-number').innerText(), /15 \/ 15/);
  assert.equal(await previewFrame.locator('.slide.is-active').getAttribute('data-slide'), '15');
  assert.equal(await presenter.locator('#talk-elapsed').innerText(), '12:00');
  assert.equal(await presenter.locator('#event-elapsed').innerText(), '15:00');
  await assertNoHorizontalOverflow(presenter, '발표자 화면 1440px');
  await presenter.screenshot({ path: path.join(root, 'screenshots', '12_발표자화면_데스크톱.png'), fullPage: false });
  trace('presenter desktop screenshot saved');

  await presenter.setViewportSize({ width: 390, height: 844 });
  await presenter.goto(`${rootUrl('presenter/index.html')}?slide=14`, { waitUntil: 'load' });
  await assertNoHorizontalOverflow(presenter, '발표자 화면 390px');
  assert.equal(await presenter.locator('#demo-steps li').count(), 4);
  await presenter.screenshot({ path: path.join(root, 'screenshots', '13_발표자화면_모바일.png'), fullPage: true });
  trace('presenter mobile screenshot saved');
  assert.deepEqual(presenterErrors.page, []);
  assert.deepEqual(presenterErrors.console, []);

  await browser.close();
  activeBrowser = null;
  trace('browser closed');
  process.stdout.write(JSON.stringify({
    result: 'PASS',
    audienceSlides: 15,
    mapFeatures: 44,
    presenterTalkSeconds: 720,
    transitionSeconds: 60,
    demoSeconds: 120,
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
