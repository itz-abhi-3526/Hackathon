import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const WIDTHS = [320, 375, 390, 430, 768, 1024, 1280];
const HEIGHT = 900;
const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;

function waitForPort(port, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error('Timeout'));
        setTimeout(check, 500);
      });
      req.end();
    };
    check();
  });
}

async function main() {
  const vite = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'pipe' });
  vite.stderr.on('data', (d) => process.stderr.write(d));

  try {
    await waitForPort(5173);
    console.log('Vite ready on :5173');

    const browser = await chromium.launch({ executablePath: EDGE, headless: true });

    for (const w of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: HEIGHT },
        deviceScaleFactor: 2,
        isMobile: w < 768,
        hasTouch: w < 768,
      });
      const page = await ctx.newPage();
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(7000);
      const file = path.join(outDir, `full-${w}px.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`Saved ${file}`);
      await ctx.close();
    }

    await browser.close();
  } finally {
    vite.kill();
    console.log('Done.');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
