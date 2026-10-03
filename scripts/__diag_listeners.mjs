/* TEMPORARY diagnostic — counts how many mouseenter/mouseleave listeners
   accumulate on links as the TECVERSO CTA is hovered repeatedly. */
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const PORT = 4201;

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
  const dev = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' });
  try {
    await waitForPort(5173);
    const browser = await chromium.launch({ executablePath: EDGE, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    /* count every listener registration, and time the MutationObserver
       re-scan that Cursor.jsx runs on every DOM mutation */
    await page.addInitScript(() => {
      window.__reg = 0;
      const orig = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function patched(type, ...rest) {
        if (type === 'mouseenter' || type === 'mouseleave') window.__reg += 1;
        return orig.call(this, type, ...rest);
      };
      window.__scanMs = 0;
      window.__scanCount = 0;
      const origQSA = Document.prototype.querySelectorAll;
      Document.prototype.querySelectorAll = function patchedQSA(sel) {
        if (sel === 'a, button, [role="button"], .vh-interactive') {
          const t = performance.now();
          const r = origQSA.call(this, sel);
          window.__scanMs += performance.now() - t;
          window.__scanCount += 1;
          window.__lastScanHits = r.length;
          return r;
        }
        return origQSA.call(this, sel);
      };
    });
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('.tecverso__cta', { timeout: 30000 });
    await settleScroll(page);
    await page.waitForTimeout(1500);

    const box = await page.locator('.tecverso__cta').boundingBox();
    const cx = box.x + box.width * 0.35;
    const cy = box.y + box.height / 2;
    await page.mouse.move(8, 8);
    await page.waitForTimeout(800);

    const snap = () => page.evaluate(() => ({
      registrations: window.__reg,
      scans: window.__scanCount,
      scanMs: +window.__scanMs.toFixed(1),
      lastScanHits: window.__lastScanHits ?? null,
      links: document.querySelectorAll('a, button, [role="button"], .vh-interactive').length,
    }));

    console.log(`\nbefore any CTA hover: ${JSON.stringify(await snap())}\n`);
    for (let i = 1; i <= 6; i += 1) {
      const t0 = Date.now();
      await page.mouse.move(cx, cy);
      await page.mouse.move(cx, cy - 320);
      const dt = Date.now() - t0;
      const s = await snap();
      console.log(`after ${String(i).padStart(2)} hover/leave pairs: ${JSON.stringify(s)}  inputDispatch=${dt}ms`);
    }
    console.log('');
    await browser.close();
  } finally {
    dev.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
