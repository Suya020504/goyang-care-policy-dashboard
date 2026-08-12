'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');

let activeBrowser = null;

function appUrl(params = {}) {
  const root = path.resolve(__dirname, '..');
  const base = process.env.TEST_URL || pathToFileURL(path.join(root, 'index.html')).href;
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.href;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath(),
  });
  activeBrowser = browser;
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto(appUrl(), { waitUntil: 'load' });
  assert.equal(await page.locator('.api-admin-launcher').count(), 0, '일반 화면에는 관리자 진입점을 표시하지 않아야 합니다.');

  await page.goto(appUrl({ admin: 1 }), { waitUntil: 'load' });
  await page.locator('.api-admin-launcher').click();
  assert.equal(await page.locator('.api-admin-modal').count(), 1);
  assert.match(await page.locator('.api-security-note').innerText(), /sessionStorage.*URL.*localStorage.*검토서.*수집 JSON/);

  const keyInput = page.locator('[data-api-key-input="tago"]');
  assert.equal(await keyInput.getAttribute('type'), 'password');
  await keyInput.fill('not-a-real-api-key');
  await page.locator('[data-api-action="save-key"][data-api-provider="tago"]').click();
  assert.match(await page.locator('[data-provider-row="tago"] .api-provider-status').innerText(), /현재 탭에 저장/);
  assert.equal(await page.evaluate(() => window.localStorage.getItem('ddol-public-api-session-v1')), null);
  assert.equal(new URL(page.url()).searchParams.has('apiKey'), false);

  const csv = [
    '표준아이디(ID),정류소번호,정류소명,경유노선,위도,경도',
    '1,100,풍산역,"070A(마을), 070B(마을), 99(시내)",37.1,126.1',
    '2,101,원당역,"043(원당역)(마을), 11(시내)",37.2,126.2',
  ].join('\r\n');
  await page.locator('input[data-api-file]').setInputFiles({
    name: '고양시_버스정류장_로컬검사.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await page.waitForTimeout(250);
  if (await page.locator('.api-file-summary').count() === 0) {
    throw new Error(`CSV 파싱 화면이 사라졌습니다: ${JSON.stringify({ errors, modal: await page.locator('.api-admin-modal').count(), body: (await page.locator('body').innerText()).slice(-500) })}`);
  }
  await page.locator('.api-file-summary').waitFor();
  const summary = await page.locator('.api-file-summary').innerText();
  assert.match(summary, /2행/);
  assert.match(summary, /3개 노선번호/);
  assert.match(summary, /SHA-256/);
  await page.locator('.api-route-list summary').click();
  const routes = await page.locator('.api-route-list').innerText();
  assert.match(routes, /043\(원당역\).*070A.*070B/s);

  await page.setViewportSize({ width: 375, height: 812 });
  const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(width.scroll <= width.client, `관리자 모바일 가로 overflow: ${JSON.stringify(width)}`);

  await page.locator('[data-api-action="delete-key"][data-api-provider="tago"]').click();
  assert.equal(await page.evaluate(() => window.sessionStorage.getItem('ddol-public-api-session-v1')), null);
  assert.deepEqual(errors, []);
  await browser.close();
  activeBrowser = null;
  process.stdout.write(JSON.stringify({ admin: true, sessionOnly: true, csvRows: 2, villageRoutes: 3, mobileWidth: width.client }));
}

main().catch(async (error) => {
  if (activeBrowser) await activeBrowser.close().catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
