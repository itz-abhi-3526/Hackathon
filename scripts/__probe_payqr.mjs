import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const PORT = 4177;
const OUT = path.join(root, '.probe-shots');

function waitForPort(port, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://localhost:${port}`, (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error('Timeout waiting for port'));
        setTimeout(check, 500);
      });
      req.end();
    };
    check();
  });
}

async function main() {
  const fs = await import('fs');
  fs.mkdirSync(OUT, { recursive: true });
  const preview = spawn('npm', ['run', 'preview', '--', '--port', String(PORT), '--strictPort'], {
    cwd: root, shell: true, stdio: 'pipe',
  });
  try {
    await waitForPort(PORT);
    const browser = await chromium.launch({ executablePath: EDGE, headless: true });

    const run = async (label, viewport) => {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 40000 });

      // Boot sequence completes then the landing CTA / nav is interactive.
      const regBtn = page.locator('button', { hasText: /REGISTER/i }).filter({ visible: true }).first();
      await regBtn.waitFor({ state: 'visible', timeout: 30000 });
      await regBtn.click();

      const cont = page.locator('button', { hasText: 'CONTINUE' });

      await page.locator('.step__fields').waitFor({ state: 'visible', timeout: 20000 });
      const inputs = page.locator('.step__input');
      await inputs.nth(0).fill('PROBE VISUAL QA');
      await inputs.nth(1).fill('NYC');
      await cont.first().click();

      await page.locator('.step__sizes').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('.sz', { hasText: '03' }).first().click();
      await cont.first().click();

      await page.locator('.step__passes').waitFor({ state: 'visible', timeout: 15000 });
      const passes = page.locator('.mpass');
      const n = await passes.count();
      for (let i = 0; i < n; i++) {
        const card = passes.nth(i);
        if (await card.locator('.mpass__input').count() === 0) {
          await card.click({ position: { x: 10, y: 30 } }).catch(() => {});
          await card.locator('.mpass__input').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(500);
        }
        const inps = card.locator('.mpass__input');
        await inps.nth(0).fill(`Member ${i + 1} Name`);
        await inps.nth(1).fill(`member${i + 1}@example.com`);
        await inps.nth(2).fill(`+9198765432${i}`);
        await card.locator('.mpass__food-btn').first().click({ force: true }).catch(() => {});
        await page.waitForTimeout(400);
      }
      await cont.first().click();

      await page.locator('.payqr__img, .payqr__ph').first().waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, `${label}-payment.png`) });

      const info = await page.evaluate(() => {
        const img = document.querySelector('.payqr__img');
        const ph = document.querySelector('.payqr__ph');
        return {
          imgSrc: img ? img.getAttribute('src') : null,
          imgLoaded: img ? img.complete && img.naturalWidth > 0 : false,
          imgW: img ? img.naturalWidth : null,
          imgH: img ? img.naturalHeight : null,
          imgCss: img ? getComputedStyle(img).objectFit : null,
          fallbackShown: Boolean(ph),
          title: (document.querySelector('.pay__label') ?? {}).textContent ?? null,
          app: (document.querySelector('.pay__app') ?? {}).textContent ?? null,
        };
      });
      console.log(`[${label}]`, JSON.stringify(info));
      console.log(`[${label}] console/page errors:`, errors.length ? errors : 'none');
      await page.close();
    };

    await run('desk', { width: 1440, height: 900 });
    await run('mobile', { width: 390, height: 844 });

    await browser.close();
  } finally {
    preview.kill();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });