const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..');
  const url = `${pathToFileURL(path.join(root, 'index.html')).href}?demo=1`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath(),
  });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('h1').first().waitFor();
  assert.match(await page.title(), /닿지 않는 돌봄/);
  assert.equal(await page.locator('.fatal').count(), 0);
  assert.match(await page.locator('body').innerText(), /204,878/);
  assert.match(await page.locator('body').innerText(), /2,095/);
  assert.match(await page.locator('body').innerText(), /접근성 계산 입력 1,893행 · 경계 안 표시 1,892점/);
  assert.match(await page.locator('body').innerText(), /재현 확인/);
  assert.match(await page.locator('h1').innerText(), /돌봄 수요가 높은데.*이동 공급이 낮은 동/);
  assert.match(await page.locator('.analysis-contract').innerText(), /WHO → HOW FAR → WHERE FIRST/);
  assert.equal(await page.locator('.report-pipeline .pipeline-step').count(), 7);
  const registeredScenarioText = await page.locator('.scenario-summary-card').innerText();
  assert.match(registeredScenarioText, /기준 후보\s*8곳/);
  assert.match(registeredScenarioText, /11개 모두 유지\s*6곳/);
  assert.match(registeredScenarioText, /조건부 유지\s*2곳/);
  assert.match(registeredScenarioText, /대안에서 추가\s*3곳/);
  assert.equal(await page.locator('.administrative-map .map-path').count(), 44);
  assert.equal(await page.locator('.administrative-map .map-candidate-marker').count(), 8);
  assert.equal(await page.locator('.administrative-map .map-candidate-label').count(), 7);
  assert.equal(await page.locator('.administrative-map .map-drt-marker').count(), 3);
  assert.equal(await page.locator('.administrative-map .map-supply-point.is-bus').count(), 2095);
  assert.equal(await page.locator('.administrative-map .map-supply-point.is-medical').count(), 0);
  assert.equal(await page.locator('.district-pulse').count(), 3);
  assert.equal(await page.locator('.composition-chart').count(), 1);
  assert.equal(await page.locator('.evidence-flow .flow-node').count(), 5);
  await page.locator('.context-item', { hasText: '1,972명' }).getByRole('button', { name: '주요 원문' }).click();
  await page.locator('.evidence-drawer').waitFor();
  assert.match(await page.locator('.evidence-drawer').innerText(), /전수조사 결과/);
  assert.match(await page.locator('.evidence-drawer').innerText(), /2026-07-10/);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.evidence-drawer').count(), 0);
  await page.locator('[data-map-layer="facility"]').click();
  assert.equal(await page.locator('.administrative-map .map-supply-point.is-medical').count(), 1397);
  assert.equal(await page.locator('.administrative-map .map-supply-point.is-pharmacy').count(), 495);
  const fullViewBox = await page.locator('.administrative-map').getAttribute('viewBox');
  const citywideLegend = await page.locator('.map-legend-scale').innerText();
  await page.locator('[data-map-district="고양시 일산동구"]').first().click();
  assert.notEqual(await page.locator('.administrative-map').getAttribute('viewBox'), fullViewBox);
  assert.match(await page.locator('.map-inspector').innerText(), /일산동구/);
  assert.equal(await page.locator('.map-legend-scale').innerText(), citywideLegend);
  await page.locator('[data-map-district="전체"]').click();
  await page.locator('[data-map-metric="candidate"]').click();
  assert.equal(await page.locator('.map-category-scale').count(), 1);
  await page.locator('[data-map-metric="nearestFacilityM"]').click();
  assert.match(await page.locator('.map-legend').innerText(), /의료시설 평균 최근접거리/);
  await page.locator('[data-map-code="4128167000"]').click();
  assert.equal(await page.locator('.map-inspector h3').innerText(), '대덕동');
  await page.locator('[data-map-code="4128163000"]').click();
  assert.equal(await page.locator('.map-inspector h3').innerText(), '행주동');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const gisFirstViewport = await page.locator('.administrative-map').boundingBox();
  assert.ok(gisFirstViewport && gisFirstViewport.y < 900, `GIS 지도가 첫 뷰포트에서 시작되어야 합니다: ${JSON.stringify(gisFirstViewport)}`);
  await page.screenshot({ path: path.join(root, 'screenshots', '00_현황_GIS_첫화면_1440x900.png'), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.screenshot({ path: path.join(root, 'screenshots', '01_현황_데스크톱.png'), fullPage: true });

  await page.locator('[data-open-candidate="4128163000"]').click();
  await page.locator('.candidate-title h2').waitFor();
  assert.equal(await page.locator('.candidate-title h2').innerText(), '행주동');
  const candidateText = await page.locator('#app-main').innerText();
  assert.match(candidateText, /27\.7%/);
  assert.match(candidateText, /746명/);
  assert.match(candidateText, /3\.05/);
  assert.match(candidateText, /1\.36km/);
  assert.match(candidateText, /8\/8/);
  assert.match(candidateText, /접근성 계산에는 HIRA 1,893행이 입력됐고 경계 밖 좌표 1건은 최근접·30분 결과에 영향이 없었습니다/);
  assert.equal(await page.locator('.candidate-map-card .map-path').count(), 44);
  assert.equal(await page.locator('.candidate-map-card .map-supply-point.is-bus').count(), 2095);
  assert.equal(await page.locator('.candidate-map-card .map-supply-point.is-medical').count(), 1397);
  assert.equal(await page.locator('.candidate-map-card .map-supply-point.is-pharmacy').count(), 495);
  assert.equal(await page.locator('.signal-row').count(), 8);
  assert.equal(await page.locator('.quadrant-chart .quadrant-point').count(), 8);
  await page.screenshot({ path: path.join(root, 'screenshots', '02_후보비교_데스크톱.png'), fullPage: true });

  await page.locator('.candidate-select').selectOption({ label: '효자동' });
  assert.equal(await page.locator('.candidate-title h2').innerText(), '효자동');
  assert.match(await page.locator('.candidate-hero').innerText(), /12\.3%/);
  assert.match(await page.locator('.candidate-hero').innerText(), /4\.15km/);
  await page.locator('.candidate-kpi [data-source]').first().click();
  await page.locator('.evidence-drawer').waitFor();
  assert.match(await page.locator('.evidence-drawer').innerText(), /행정안전부/);
  await page.locator('.evidence-drawer [data-action="close-overlay"]').click();

  await page.locator('[data-stage="3"]').first().click();
  const validationText = await page.locator('#app-main').innerText();
  assert.match(validationText, /29개/);
  assert.match(validationText, /MAE 0\.174/);
  assert.match(validationText, /관산동 q=0\.0403/);
  assert.match(validationText, /최저 J=0\.60/);
  assert.match(validationText, /6개를 유지하고 2개가 교체/);
  assert.equal(await page.locator('.sensitivity-row').count(), 11);
  assert.equal(await page.locator('.validation-flow .flow-node').count(), 4);
  assert.equal(await page.locator('.professional-analysis').count(), 1);
  const professionalText = await page.locator('.professional-analysis').innerText();
  assert.match(professionalText, /45개/);
  assert.match(professionalText, /0\.455/);
  assert.match(professionalText, /21\.8%/);
  assert.match(professionalText, /19\.5%/);
  assert.match(professionalText, /가좌동 · 고양동 · 관산동 · 주교동 · 행주동/);
  assert.match(professionalText, /능곡동 37\/45 · 송포동 31\/45 · 효자동 42\/45/);
  assert.match(professionalText, /전체 조합[\s\S]*231개/);
  assert.match(professionalText, /전 조합 유지[\s\S]*1곳[\s\S]*고양동/);
  assert.match(professionalText, /최저 Jaccard[\s\S]*0\.333/);
  assert.match(professionalText, /실제 정책 가중치 범위나 선정확률이 아닙니다/);
  assert.match(professionalText, /기준 DSS top3[\s\S]*가좌동 · 효자동 · 고봉동/);
  assert.match(professionalText, /현행 팀매핑 3동[\s\S]*고봉동 · 식사동 · 화전동/);
  assert.match(professionalText, /겹침[\s\S]*고봉동/);
  assert.equal(await page.locator('.pro-weight-chart title').count(), 11);
  assert.equal(await page.locator('.spatial-weight-row').count(), 3);
  assert.equal(await page.locator('.construct-list > div').count(), 5);
  assert.equal(await page.locator('.claim-item').count(), 29);
  assert.match(await page.locator('.model-row').nth(1).innerText(), /60%/);
  assert.match(await page.locator('.model-row').nth(2).innerText(), /60%/);
  assert.match(await page.locator('.model-row').nth(3).innerText(), /100%/);
  await page.screenshot({ path: path.join(root, 'screenshots', '03_재검증_데스크톱.png'), fullPage: true });
  await page.locator('[data-filter="조건부"]').click();
  assert.equal(await page.locator('.claim-item').count(), 9);

  await page.locator('[data-stage="4"]').first().click();
  assert.equal(await page.locator('.policy-score-row').count(), 5);
  assert.equal(await page.locator('.decision-question').count(), 5);
  assert.match(await page.locator('.policy-score-card').innerText(), /시연용 미검증 규칙표 v1/);
  await page.locator('.policy-rule-ledger summary').click();
  assert.equal(await page.locator('.rule-ledger-row:not(.is-head)').count(), 33);
  const policyRuleText = await page.locator('.policy-rule-ledger').innerText();
  assert.match(policyRuleText, /국토부·고양시 공식 점수식 아님/);
  assert.match(policyRuleText, /R-VI-01[\s\S]*방문 가능[\s\S]*\+8/);
  assert.match(policyRuleText, /가점 크기와 7·4점 구간은 행정 합의나 효과 검증을 거치지 않았으므로/);
  await page.locator('.policy-rule-ledger summary').click();
  assert.match(await page.locator('.area-signal-summary').innerText(), /공개데이터 지역 신호/);
  assert.match(await page.locator('.policy-card').first().innerText(), /효자동/);
  await page.locator('[data-field="serviceMode"]').selectOption('visit');
  assert.match(await page.locator('.first-review h2').innerText(), /방문서비스 연계/);
  await page.locator('[data-field="wheelchair"]').check();
  assert.match(await page.locator('#app-main').innerText(), /휠체어/);
  const vehicleRange = page.locator('[data-field="vehicles"]');
  await vehicleRange.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(50);
  assert.equal(await vehicleRange.inputValue(), '3');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-field')), 'vehicles');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(50);
  assert.equal(await page.locator('[data-field="vehicles"]').inputValue(), '4');
  assert.match(await page.locator('output[for="vehicles"]').innerText(), /4대/);
  assert.equal(await page.locator('.pilot-kpi-grid > div').count(), 4);
  assert.match(await page.locator('.pilot-kpi-card').innerText(), /분모·기준선·비교권역·로그 결합키/);
  await page.locator('[data-field="decisionStatus"]').selectOption('pilot_review');
  await page.locator('[data-field="decisionReason"]').fill('호출로그와 실제 목적지 확인 후 파일럿 검토');
  await page.locator('[data-field="decisionReason"]').press('Tab');
  assert.equal(await page.locator('[data-field="decisionStatus"]').inputValue(), 'pilot_review');
  assert.match(await page.locator('[data-field="decisionReason"]').inputValue(), /호출로그와 실제 목적지/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(root, 'screenshots', '04_정책시나리오_데스크톱.png'), fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.policy-results [data-action="export"]').click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /효자동/);
  const downloadStream = await download.createReadStream();
  const downloadChunks = [];
  for await (const chunk of downloadStream) downloadChunks.push(chunk);
  const exportedReview = JSON.parse(Buffer.concat(downloadChunks).toString('utf8'));
  assert.equal(exportedReview.humanReview.status, 'pilot_review');
  assert.match(exportedReview.humanReview.reason, /호출로그와 실제 목적지/);
  assert.equal(exportedReview.pilotKpiPlan.length, 4);
  assert.equal(exportedReview.policyRule.version, 'demo-unvalidated-v1');
  assert.equal(exportedReview.policyRule.ledger.length, 33);
  assert.match(exportedReview.policyRule.note, /단독 정책결정 금지/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${pathToFileURL(path.join(root, 'index.html')).href}?demo=1`, { waitUntil: 'load' });
  assert.equal(await page.locator('.administrative-map .map-path').count(), 44);
  const mobileMap = await page.locator('.administrative-map').boundingBox();
  assert.ok(mobileMap && mobileMap.y < 844, `모바일 첫 화면에 GIS 시작점이 보여야 합니다: ${JSON.stringify(mobileMap)}`);
  await page.screenshot({ path: path.join(root, 'screenshots', '05_현황_GIS_모바일.png'), fullPage: true });
  await page.locator('[data-stage="2"]').first().click();
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(overflow.scroll <= overflow.viewport, `모바일 가로 overflow: ${JSON.stringify(overflow)}`);
  assert.equal(await page.locator('.candidate-title h2').innerText(), '행주동');
  assert.match(await page.locator('#app-main').innerText(), /증거 \/ 분석 정보/);
  await page.screenshot({ path: path.join(root, 'screenshots', '06_후보비교_모바일.png'), fullPage: true });
  await page.locator('[data-stage="3"]').first().click();
  await page.screenshot({ path: path.join(root, 'screenshots', '07_재검증_모바일.png'), fullPage: true });
  await page.locator('[data-stage="4"]').first().click();
  await page.screenshot({ path: path.join(root, 'screenshots', '08_정책시나리오_모바일.png'), fullPage: true });

  await page.setViewportSize({ width: 320, height: 720 });
  const mobileOverflow = {};
  for (const stage of [1, 2, 3, 4]) {
    await page.locator(`[data-stage="${stage}"]`).first().click();
    mobileOverflow[stage] = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(mobileOverflow[stage].scroll <= mobileOverflow[stage].viewport, `320px ${stage}단계 가로 overflow: ${JSON.stringify(mobileOverflow[stage])}`);
    if (stage === 1) await page.screenshot({ path: path.join(root, 'screenshots', '09_현황_GIS_모바일_320.png'), fullPage: true });
  }

  // 1440px 화면을 브라우저 200%로 확대했을 때의 유효 CSS 폭(720px)과 같은 재배치 조건이다.
  await page.setViewportSize({ width: 720, height: 450 });
  await page.goto(`${pathToFileURL(path.join(root, 'index.html')).href}?demo=1`, { waitUntil: 'load' });
  const reflowAt200Percent = {};
  for (const stage of [1, 2, 3, 4]) {
    await page.locator(`[data-stage="${stage}"]`).first().click();
    reflowAt200Percent[stage] = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(reflowAt200Percent[stage].scroll <= reflowAt200Percent[stage].viewport, `200% 상당 유효폭 ${stage}단계 가로 overflow: ${JSON.stringify(reflowAt200Percent[stage])}`);
    const unnamedInteractive = await page.evaluate(() => Array.from(document.querySelectorAll('button,a[href],input,select,textarea,summary'))
      .filter((element) => {
        const label = element.getAttribute('aria-label')
          || element.innerText
          || element.value
          || element.title
          || (element.labels && Array.from(element.labels).map((item) => item.innerText).join(' '));
        return !String(label || '').trim();
      }).map((element) => ({ tag: element.tagName, id: element.id, type: element.type || '' })));
    assert.deepEqual(unnamedInteractive, [], `${stage}단계 접근 가능한 이름 없는 조작요소`);
  }

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  await browser.close();
  process.stdout.write(JSON.stringify({
    result: 'PASS',
    pages: ['현황', '후보 비교', '재검증 근거', '정책 시나리오'],
    desktop: '1440x1024',
    mobile: '390x844',
    overflow,
    mobileOverflow320: mobileOverflow,
    reflowAt200Percent,
    consoleErrors,
    pageErrors,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
