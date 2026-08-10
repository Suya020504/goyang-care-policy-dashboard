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

function captureErrors(page) {
  const errors = { console: [], page: [] };
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const source = message.location().url;
    if (source.endsWith('/favicon.ico')) return;
    errors.console.push(source ? `${message.text()} @ ${source}` : message.text());
  });
  page.on('pageerror', (error) => errors.page.push(error.message));
  return errors;
}

async function assertNoOverflow(page, label) {
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(width.scroll <= width.client, `${label} 가로 overflow: ${JSON.stringify(width)}`);
}

async function goNext(page) {
  await page.locator('.guided-primary-action').click();
  await page.locator('#app-main').waitFor();
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath(),
  });
  activeBrowser = browser;
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = captureErrors(page);

  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto(appUrl({ demo: 1 }), { waitUntil: 'load' });
  assert.equal(await page.locator('.guided-app').count(), 1);
  assert.equal(await page.locator('.guided-step').count(), 6);
  assert.equal(await page.locator('.stage-nav').count(), 0);
  assert.match(await page.locator('h1').innerText(), /오늘 무엇을 판단/);
  assert.match(await page.locator('#app-main').innerText(), /사업 도입지가 아니라.*현장조사 대상/);
  assert.equal(await page.locator('[data-guided-field="selectedCode"]').inputValue(), '4128163000');
  assertNoOverflow(page, '안내 1단계 1440px');

  await goNext(page);
  assert.match(page.url(), /step=2/);
  assert.match(await page.locator('h1').innerText(), /왜 행주동을 먼저 확인/);
  assert.equal(await page.locator('.guided-map-svg path').count(), 44);
  assert.equal(await page.locator('.guided-map-svg path.is-candidate').count(), 8);
  assert.equal(await page.locator('.guided-map-svg path.is-selected').count(), 1);
  const signals = await page.locator('.guided-signal-list').innerText();
  assert.match(signals, /27\.7%/);
  assert.match(signals, /19\.4%/);
  assert.match(signals, /3\.05/);
  assert.match(signals, /3\.77/);
  assert.match(signals, /1\.36km/);
  assert.match(signals, /1\.31km/);

  await goNext(page);
  const confidence = await page.locator('#app-main').innerText();
  assert.match(confidence, /8\/8/);
  assert.match(confidence, /45\/45/);
  assert.match(confidence, /206\/231/);
  assert.match(confidence, /선정확률이 아닙니다/);
  assert.match(confidence, /DSS 값과 후보 내부순위/);

  await goNext(page);
  assert.equal(await page.locator('.guided-check-row input[type="checkbox"]').count(), 6);
  assert.equal(await page.locator('.guided-check-row input[type="checkbox"]:checked').count(), 0);
  await goNext(page);
  assert.match(await page.locator('.toast').innerText(), /한 개 이상 선택/);
  assert.match(page.url(), /step=4/);
  await page.locator('.guided-check-row input[type="checkbox"]').nth(0).check();
  await page.locator('.guided-check-row input[type="checkbox"]').nth(3).check();
  assert.equal(await page.locator('.guided-check-row input[type="checkbox"]:checked').count(), 2);

  await goNext(page);
  assert.match(page.url(), /step=5/);
  for (let index = 0; index < 5; index += 1) {
    assert.equal(await page.locator('.guided-policy-question').count(), 1);
    assert.match(await page.locator('.guided-question-progress').innerText(), new RegExp(`질문 ${index + 1} \\/ 5`));
    const answer = index === 0 ? 'yes' : index === 4 ? 'no' : 'unknown';
    await page.locator(`[data-guided-answer="${answer}"]`).check();
    if (index < 4) {
      await page.locator('[data-action="guided-policy-next"]').click();
    } else {
      await goNext(page);
    }
  }

  assert.match(page.url(), /step=6/);
  assert.match(await page.locator('h1').innerText(), /행주동 현장조사 체크리스트/);
  assert.equal(await page.locator('.guided-final-checks input[type="checkbox"]').count(), 6);
  assert.equal(await page.locator('.guided-final-checks input[type="checkbox"]:checked').count(), 2);
  assert.match(await page.locator('.guided-review-note').innerText(), /개인정보를 입력받지 않습니다/);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-action="guided-save"]').click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /현장조사_체크리스트_행주동/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(payload.schemaVersion, 'field-checklist-v1');
  assert.equal(payload.area.dong, '행주동');
  assert.equal(payload.fieldChecks.length, 6);
  assert.equal(payload.fieldChecks.filter((item) => item.checked).length, 2);
  assert.equal(payload.alternativeQuestions.length, 5);
  assert.equal(payload.alternativeQuestions[0].answer, 'yes');
  assert.equal(payload.alternativeQuestions[4].answer, 'no');
  assert.equal(payload.humanReview.status, 'investigate');
  assert.match(payload.humanReview.notice, /개인정보 입력 없이/);
  assert.equal('note' in payload, false);
  assert.equal('recommendation' in payload, false);
  assert.equal('score' in payload, false);

  await page.locator('[data-action="open-analysis"]').click();
  assert.equal(await page.locator('.stage-nav').count(), 1);
  assert.match(page.url(), /view=analysis/);
  assert.match(page.url(), /dong=4128163000/);
  await page.locator('[data-view="guided"]').click();
  assert.equal(await page.locator('.guided-app').count(), 1);
  assert.match(page.url(), /step=6/);

  await page.evaluate(() => window.localStorage.setItem('ddol-dashboard-guided-v1', JSON.stringify({
    step: 1,
    visitedStep: 1,
    selectedCode: '4128163000',
    checks: [],
    answers: {},
    note: '구형 민감 메모',
  })));
  await page.reload({ waitUntil: 'load' });
  const migratedGuidedState = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem('ddol-dashboard-guided-v1') || '{}',
  ));
  assert.equal('note' in migratedGuidedState, false);

  await page.goto(appUrl({ demo: 1, stage: 2 }), { waitUntil: 'load' });
  assert.equal(await page.locator('.stage-nav').count(), 1);
  assert.match(page.url(), /stage=2/);

  for (const viewport of [
    { width: 390, height: 844, label: '390px' },
    { width: 320, height: 720, label: '320px' },
    { width: 720, height: 900, label: '200% 대리 720px' },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const step of [1, 2, 3, 4, 5, 6]) {
      await page.goto(appUrl({ demo: 1, view: 'guided', step }), { waitUntil: 'load' });
      assert.equal(await page.locator('.guided-app').count(), 1);
      await assertNoOverflow(page, `${viewport.label} ${step}단계`);
      if (step === 5) assert.equal(await page.locator('.guided-policy-question').count(), 1);
    }
  }

  const unnamed = await page.locator('button, select, input, textarea').evaluateAll((elements) => elements
    .filter((element) => !element.disabled)
    .filter((element) => {
      const labelled = element.getAttribute('aria-label')
        || element.getAttribute('aria-labelledby')
        || element.labels?.[0]?.innerText
        || element.innerText
        || element.value;
      return !String(labelled || '').trim();
    })
    .map((element) => element.outerHTML));
  assert.deepEqual(unnamed, []);
  assert.deepEqual(errors.console, []);
  assert.deepEqual(errors.page, []);

  await browser.close();
  activeBrowser = null;
  process.stdout.write(JSON.stringify({
    result: 'PASS',
    steps: 6,
    mapFeatures: 44,
    questionsShownAtOnce: 1,
    checklistItems: 6,
    viewports: ['1440x1024', '390x844', '320x720', '720x900'],
  }, null, 2));
}

main().catch(async (error) => {
  await activeBrowser?.close();
  activeBrowser = null;
  console.error(error);
  process.exitCode = 1;
});
