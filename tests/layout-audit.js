// 29장 전 슬라이드의 겹침·잘림·넘침을 측정하고 캡처한다.
// 실행: node tests/layout-audit.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.tmp', 'layout-audit');
const url = (slide) => `file://${path.join(ROOT, 'presentation/index.html').replace(/\\/g, '/')}?slide=${slide}`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath(),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const report = [];

  for (let n = 1; n <= 29; n += 1) {
    await page.goto(url(n), { waitUntil: 'load' });
    await page.waitForTimeout(220);

    const found = await page.evaluate(() => {
      const slide = document.querySelector('.slide.is-active');
      if (!slide) return { error: 'no active slide' };
      const sr = slide.getBoundingClientRect();

      // 텍스트를 담은 말단 요소만
      const leaves = [...slide.querySelectorAll('*')].filter((n) => {
        const t = n.tagName.toLowerCase();
        if (t === 'title' || t === 'desc' || t === 'defs' || t === 'svg') return false;
        if (n.closest('svg')) return false;
        return n.children.length === 0 && n.textContent.trim() && n.getClientRects().length;
      });

      const rect = (n) => n.getBoundingClientRect();
      const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);

      // 1) 겹침 — 형제 관계가 아닌(조상-후손이 아닌) 두 요소의 사각형이 실제로 겹치는가
      const overlaps = [];
      for (let i = 0; i < leaves.length; i += 1) {
        for (let j = i + 1; j < leaves.length; j += 1) {
          const a = leaves[i]; const b = leaves[j];
          if (a.contains(b) || b.contains(a)) continue;
          const ra = rect(a); const rb = rect(b);
          const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (ix > 2 && iy > 2) {
            const overlapArea = ix * iy;
            const ratio = overlapArea / Math.min(area(ra) || 1, area(rb) || 1);
            if (ratio > 0.12) {
              overlaps.push({
                a: (a.className || a.tagName) + ' | ' + a.textContent.trim().slice(0, 22),
                b: (b.className || b.tagName) + ' | ' + b.textContent.trim().slice(0, 22),
                ratio: +ratio.toFixed(2),
              });
            }
          }
        }
      }

      // 2) 글자 잘림 — 실제 내용이 상자보다 큰 경우
      const clipped = leaves
        .filter((n) => {
          const cs = getComputedStyle(n);
          const hidden = cs.overflow === 'hidden' || cs.overflowY === 'hidden' || cs.overflowX === 'hidden';
          const overW = n.scrollWidth > n.clientWidth + 2;
          const overH = n.scrollHeight > n.clientHeight + 2;
          return hidden && (overW || overH);
        })
        .map((n) => ({ el: (n.className || n.tagName), t: n.textContent.trim().slice(0, 26) }));

      // 3) 슬라이드 캔버스 밖으로 나간 요소
      const outside = leaves
        .filter((n) => {
          const r = rect(n);
          return r.bottom > sr.bottom + 3 || r.right > sr.right + 3 || r.top < sr.top - 3 || r.left < sr.left - 3;
        })
        .map((n) => ({ el: (n.className || n.tagName), t: n.textContent.trim().slice(0, 26) }));

      // 4) 세로 넘침
      const vOverflow = slide.scrollHeight > slide.clientHeight + 4
        ? { scroll: slide.scrollHeight, client: slide.clientHeight } : null;

      return {
        heading: (slide.querySelector('h1, h2') || {}).textContent || '',
        leaves: leaves.length,
        overlaps: overlaps.slice(0, 6),
        overlapCount: overlaps.length,
        clipped: clipped.slice(0, 5),
        clippedCount: clipped.length,
        outside: outside.slice(0, 5),
        outsideCount: outside.length,
        vOverflow,
      };
    });

    report.push({ slide: n, ...found });
    await page.screenshot({ path: path.join(OUT, `slide-${String(n).padStart(2, '0')}.png`) });
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1), 'utf8');

  const bad = report.filter((r) => r.overlapCount || r.clippedCount || r.outsideCount || r.vOverflow);
  console.log(`검사 29장 · 문제 있는 슬라이드 ${bad.length}장`);
  bad.forEach((r) => {
    console.log(`\n[${r.slide}] ${String(r.heading).trim().slice(0, 40)}`);
    if (r.overlapCount) { console.log(`  겹침 ${r.overlapCount}건`); r.overlaps.forEach((o) => console.log(`    · ${o.a}  ↔  ${o.b}  (${o.ratio})`)); }
    if (r.clippedCount) { console.log(`  잘림 ${r.clippedCount}건`); r.clipped.forEach((c) => console.log(`    · ${c.el} | ${c.t}`)); }
    if (r.outsideCount) { console.log(`  캔버스 밖 ${r.outsideCount}건`); r.outside.forEach((c) => console.log(`    · ${c.el} | ${c.t}`)); }
    if (r.vOverflow) console.log(`  세로 넘침 ${r.vOverflow.scroll} > ${r.vOverflow.client}`);
  });
  console.log(`\n캡처: ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
