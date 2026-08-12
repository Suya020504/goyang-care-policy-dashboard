const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');

async function main() {
  const root = path.resolve(__dirname, '..');
  const base = process.env.TEST_URL || pathToFileURL(path.join(root, 'index.html')).href;
  const outputDir = path.join(root, 'presentation', 'assets');
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath(),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(10000);
    for (let step = 1; step <= 4; step += 1) {
      const url = new URL(base);
      url.searchParams.set('demo', '1');
      url.searchParams.set('view', 'guided');
      url.searchParams.set('step', String(step));
      await page.goto(url.href, { waitUntil: 'load' });
      await page.locator('.guided-app').waitFor();
      await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: path.join(outputDir, `gwansan-step-${step}.png`),
        fullPage: false,
        animations: 'disabled',
      });
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
