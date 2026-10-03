/* TEMPORARY verification — runs against the production preview build.
   1. CTA renders, label text + accessible name intact
   2. 40 hover/leave sweeps: frame pacing + layout/style counters
   3. Click opens https://www.tecverso.in/ in a NEW tab, rel=noopener noreferrer */
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const PORT = 4199;

function waitForPort(port, timeout = 90000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://localhost:${port}`, () => { req.resume?.(); resolve(); });
      req.on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error('timeout'));
        setTimeout(check, 400);
      });
      req.end();
    };
    check();
  });
}

async function settleScroll(page) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.evaluate(() => {
      const el = document.querySelector('#tecverso');
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120);
    });
    let last = null; let stable = 0;
    for (let i = 0; i < 40; i += 1) {
      await page.waitForTimeout(120);
      const y = await page.evaluate(() => Math.round(document.querySelector('.tecverso__cta').getBoundingClientRect().y * 100) / 100);
      if (last !== null && y === last) stable += 1; else stable = 0;
      last = y;
      if (stable >= 4 && y > 40 && y < 700) return y;
    }
  }
  return null;
}

async function main() {
  const preview = spawn('npm', ['run', 'preview', '--', '--port', String(PORT), '--strictPort'], { cwd: root, shell: true, stdio: 'ignore' });
  let failures = 0;
  const check = (label, pass, detail) => {
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`);
    if (!pass) failures += 1;
  };
  try {
    await waitForPort(PORT);
    const browser = await chromium.launch({ executablePath: EDGE, headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('.tecverso__cta', { timeout: 30000 });
    await settleScroll(page);
    await page.waitForTimeout(1500);

    console.log('\n[1] RENDER + COPY');
    const info = await page.evaluate(() => {
      const a = document.querySelector('.tecverso__cta');
      const label = document.querySelector('.tecverso__cta-text');
      return {
        href: a.getAttribute('href'),
        target: a.getAttribute('target'),
        rel: a.getAttribute('rel'),
        ariaLabel: a.getAttribute('aria-label'),
        labelText: label.textContent,
        glyphCount: label.querySelectorAll('.tecverso__cta-char').length,
        arrow: document.querySelector('.tecverso__cta-arrow').textContent,
        fontFamily: getComputedStyle(label).fontFamily,
        fontSize: getComputedStyle(label).fontSize,
        letterSpacing: getComputedStyle(label).letterSpacing,
        color: getComputedStyle(label).color,
      };
    });
    check('href is https://www.tecverso.in/', info.href === 'https://www.tecverso.in/', info.href);
    check('target="_blank"', info.target === '_blank', info.target);
    check('rel="noopener noreferrer"', info.rel === 'noopener noreferrer', info.rel);
    check('label text unchanged', info.labelText === 'EXPLORE WORKSHOPS', JSON.stringify(info.labelText));
    check('aria-label pins accessible name', info.ariaLabel === 'EXPLORE WORKSHOPS', JSON.stringify(info.ariaLabel));
    check('17 glyph spans', info.glyphCount === 17, String(info.glyphCount));
    check('arrow unchanged', info.arrow === '\u2197', JSON.stringify(info.arrow));
    check('typography unchanged', /Bebas Neue/.test(info.fontFamily) && info.letterSpacing === '3.2832px', `${info.fontFamily} / ${info.fontSize} / ls ${info.letterSpacing}`);
    check('label color unchanged', info.color === 'rgb(242, 240, 237)', info.color);

    console.log('\n[2] 20 HOVER / LEAVE SWEEPS (stutter test)');
    const box = await page.locator('.tecverso__cta').boundingBox();
    const cx = box.x + box.width * 0.35;
    const cy = box.y + box.height / 2;
    await page.mouse.move(8, 8);
    await page.waitForTimeout(1200);

    /* idle floor */
    const pick = (m, k) => m.metrics.find((x) => x.name === k)?.value ?? 0;
    const m0 = await cdp.send('Performance.getMetrics');
    const idleFrames = await page.evaluate(async () => {
      const t = []; let stop = false;
      const tick = (x) => { t.push(x); if (!stop) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      await new Promise((r) => setTimeout(r, 800));
      stop = true;
      const d = []; for (let i = 1; i < t.length; i += 1) d.push(t[i] - t[i - 1]);
      return d;
    });
    const m1 = await cdp.send('Performance.getMetrics');
    const idleLayout = pick(m1, 'LayoutCount') - pick(m0, 'LayoutCount');
    const idleTaskMs = (pick(m1, 'TaskDuration') - pick(m0, 'TaskDuration')) * 1000;

    const m2 = await cdp.send('Performance.getMetrics');
    await page.evaluate(() => {
      window.__f = [];
      let stop = false;
      const tick = (x) => { window.__f.push(x); if (!stop) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      window.__stopF = () => { stop = true; };
    });
    for (let i = 0; i < 20; i += 1) {
      await page.mouse.move(cx, cy);
      await page.mouse.move(cx, cy - 320);
      if (i % 5 === 4) console.log(`      ...${(i + 1) * 2} transitions swept`);
    }
    const deltas = await page.evaluate(() => {
      window.__stopF();
      const t = window.__f; const d = [];
      for (let i = 1; i < t.length; i += 1) d.push(t[i] - t[i - 1]);
      return d;
    });
    const m3 = await cdp.send('Performance.getMetrics');

    const sweepLayout = pick(m3, 'LayoutCount') - pick(m2, 'LayoutCount');
    const sweepTaskMs = (pick(m3, 'TaskDuration') - pick(m2, 'TaskDuration')) * 1000;
    const idleRate = idleFrames.length / 0.8;
    const sweepRate = deltas.length / (deltas.reduce((a, b) => a + b, 0) / 1000);
    const sorted = [...deltas].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const worst = sorted[sorted.length - 1];
    const over32 = deltas.filter((d) => d > 32).length;
    const over50 = deltas.filter((d) => d > 50).length;

    console.log(`      idle floor:        ${idleFrames.length} frames / 800ms (${idleRate.toFixed(0)} fps), ${idleLayout} layouts, ${idleTaskMs.toFixed(0)}ms task`);
    console.log(`      40 hover+leave:    ${deltas.length} frames at ${sweepRate.toFixed(0)} fps, ${sweepLayout} layouts, ${sweepTaskMs.toFixed(0)}ms task`);
    console.log(`      frame pacing:      p95=${p95.toFixed(1)}ms  worst=${worst.toFixed(1)}ms  frames>32ms=${over32}  frames>50ms=${over50}`);
    check('no frame over 50ms during sweeps (no freeze)', over50 === 0, `${over50} frames > 50ms`);
    check('sweep frame rate holds near idle rate', sweepRate > idleRate * 0.75, `${sweepRate.toFixed(0)} vs idle ${idleRate.toFixed(0)} fps`);
    check('hover/leave adds no layout work (0 per sweep pair)', sweepLayout <= idleLayout * 0.25, `${sweepLayout} layouts for 80 transitions vs idle ${idleLayout}`);

    console.log('\n[3] CLICK -> NEW TAB');
    const box2 = await page.locator('.tecverso__cta').boundingBox();
    const [popup] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 15000 }).catch(() => null),
      page.mouse.click(box2.x + box2.width * 0.35, box2.y + box2.height / 2),
    ]);
    check('click opened a new tab', !!popup, popup ? 'popup received' : 'no popup event');
    if (popup) {
      const url = popup.url();
      await popup.close().catch(() => {});
      check('new tab URL is https://www.tecverso.in/', /^https:\/\/(www\.)?tecverso\.in\/?/.test(url), url);
    }
    const opener = await page.evaluate(() => {
      const a = document.querySelector('.tecverso__cta');
      return { rel: a.rel, target: a.target, opener: window.opener === null ? 'null' : 'set' };
    });
    check('rel="noopener noreferrer" on the anchor', opener.rel === 'noopener noreferrer', opener.rel);
    check('target="_blank" on the anchor', opener.target === '_blank', opener.target);
    check('window.opender is null (noopener honoured)', opener.opener === 'null', opener.opener);

    await browser.close();
    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  } finally {
    preview.kill();
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
