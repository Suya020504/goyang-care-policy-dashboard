const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const PRESENTATION = path.join(ROOT, 'presentation', 'index.html');
const OUTPUT_ROOT = path.join(ROOT, 'presentation', 'export');
const PNG_DIR = path.join(OUTPUT_ROOT, 'png');
const PDF_PATH = path.join(OUTPUT_ROOT, '닿지않는돌봄_본선발표.pdf');

function presentationUrl(params = {}) {
  const url = new URL(pathToFileURL(PRESENTATION).href);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.href;
}

async function waitForStableSlide(page, slide) {
  await page.goto(presentationUrl({ slide, presenter: 1, capture: 1 }), { waitUntil: 'load' });
  await page.locator(`.slide.is-active[data-slide="${slide}"]`).waitFor();
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(100);
}

async function main() {
  fs.mkdirSync(PNG_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath(),
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await waitForStableSlide(page, 1);
    const slideCount = await page.locator('.slide').count();
    if (slideCount < 1) throw new Error('내보낼 슬라이드를 찾지 못했습니다.');

    for (let slide = 1; slide <= slideCount; slide += 1) {
      await waitForStableSlide(page, slide);
      const output = path.join(PNG_DIR, `slide-${String(slide).padStart(2, '0')}.png`);
      await page.locator('.slide.is-active').screenshot({ path: output });
    }

    await page.goto(presentationUrl({ capture: 1 }), { waitUntil: 'load' });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: PDF_PATH,
      width: '1600px',
      height: '900px',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
    });

    if (errors.length) throw new Error(`브라우저 오류: ${errors.join(' | ')}`);
    process.stdout.write(`발표자료 내보내기 완료: PNG ${slideCount}장, PDF ${PDF_PATH}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
