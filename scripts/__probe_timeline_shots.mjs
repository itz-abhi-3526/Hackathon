import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const PORT = 4174;
const outDir = path.join(root, 'screenshots', 'tl');
fs.mkdirSync(outDir, { recursive: true });

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
  const preview = spawn('npm', ['run', 'preview', '--', '--port', String(PORT), '--strictPort'], {
    cwd: root, shell: true, stdio: 'pipe',
  });
  try {
    await waitForPort(PORT);
    const browser = await chromium.launch({ executablePath: EDGE, headless: true });

    for (const width of [1440, 1023, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 40000 });
      await page.waitForSelector('#timeline', { timeout: 30000 });
      await page.waitForTimeout(1200);

      const heights = width < 1024 ? [900] : [900];
      const data = await page.evaluate((winH) => {
        const y = (el) => el && Math.round(el.getBoundingClientRect().top);
        const tl = document.querySelector('#timeline');
        const vp = document.querySelector('.timeline__viewport');
        const cd = document.querySelector('.countdown');
        const prizes = document.querySelector('.prizes');
        const track = document.querySelector('.timeline__track');
        return { tlT: y(tl), tlH: Math.round(tl?.getBoundingClientRect().height), vpT: y(vp), cdB: y(cd) + (cd ? Math.round(cd.getBoundingClientRect().height) : 0), prizesT: y(prizes), vpPos: vp ? getComputedStyle(vp).position : null, trackX: track?.style.transform, active: [...document.querySelectorAll('.timeline__phase')].findIndex((p) => p.classList.contains('timeline__phase--active')) + 1 };
      }, 900);
      console.log(`WIDTH ${width} (scrollY=0):`, JSON.stringify(data));
      await page.screenshot({ path: path.join(outDir, `w${width}-entry.png`) });

      if (width >= 1024) {
        await page.mouse.move(width / 2, 450);
        for (let i = 0; i < 34; i++) {
          await page.mouse.wheel(0, 180);
          await page.waitForTimeout(80);
        }
        const d1 = await page.evaluate((winH) => {
          const y = (el) => el && Math.round(el.getBoundingClientRect().top);
          const tl = document.querySelector('#timeline');
          const vp = document.querySelector('.timeline__viewport');
          const prizes = document.querySelector('.prizes');
          return { scrollY: Math.round(window.scrollY), tlT: y(tl), vpT: y(vp), prizesT: y(prizes), vpPos: vp ? getComputedStyle(vp).position : null, trackX: document.querySelector('.timeline__track')?.style.transform, active: [...document.querySelectorAll('.timeline__phase')].findIndex((p) => p.classList.contains('timeline__phase--active')) + 1 };
        }, 900);
        console.log(`WIDTH ${width} (pinned mid):`, JSON.stringify(d1));
        await page.screenshot({ path: path.join(outDir, `w${width}-pinned.png`) });

        for (let i = 0; i < 34; i++) {
          await page.mouse.wheel(0, 180);
          await page.waitForTimeout(80);
        }
        const d2 = await page.evaluate((winH) => {
          const y = (el) => el && Math.round(el.getBoundingClientRect().top);
          const tl = document.querySelector('#timeline');
          const vp = document.querySelector('.timeline__viewport');
          const prizes = document.querySelector('.prizes');
          return { scrollY: Math.round(window.scrollY), tlT: y(tl), vpT: y(vp), prizesT: y(prizes), vpPos: vp ? getComputedStyle(vp).position : null, trackX: document.querySelector('.timeline__track')?.style.transform, active: [...document.querySelectorAll('.timeline__phase')].findIndex((p) => p.classList.contains('timeline__phase--active')) + 1 };
        }, 900);
        console.log(`WIDTH ${width} (after complete):`, JSON.stringify(d2));
        await page.screenshot({ path: path.join(outDir, `w${width}-after.png`) });

        for (let i = 0; i < 26; i++) {
          await page.mouse.wheel(0, 180);
          await page.waitForTimeout(80);
        }
        const d3 = await page.evaluate((winH) => {
          const y = (el) => el && Math.round(el.getBoundingClientRect().top);
          const tl = document.querySelector('#timeline');
          const vp = document.querySelector('.timeline__viewport');
          const prizes = document.querySelector('.prizes');
          return { scrollY: Math.round(window.scrollY), tlT: y(tl), vpT: y(vp), prizesT: y(prizes), vpPos: vp ? getComputedStyle(vp).position : null, trackX: document.querySelector('.timeline__track')?.style.transform, active: [...document.querySelectorAll('.timeline__phase')].findIndex((p) => p.classList.contains('timeline__phase--active')) + 1 };
        }, 900);
        console.log(`WIDTH ${width} (way past):`, JSON.stringify(d3));
        await page.screenshot({ path: path.join(outDir, `w${width}-past.png`) });
      } else {
        for (let i = 0; i < 40; i++) {
          await page.mouse.wheel(0, 180);
          await page.waitForTimeout(70);
        }
        const d1 = await page.evaluate((winH) => {
          const y = (el) => el && Math.round(el.getBoundingClientRect().top);
          const tl = document.querySelector('#timeline');
          const sp = document.querySelector('.timeline__static-spine');
          return { scrollY: Math.round(window.scrollY), tlT: y(tl), spineDisplay: sp ? getComputedStyle(sp).display : null, staticClass: tl?.classList.contains('timeline--static'), phaseCount: document.querySelectorAll('.timeline__phase').length };
        }, 900);
        console.log(`WIDTH ${width} (mobile scrolled):`, JSON.stringify(d1));
        await page.screenshot({ path: path.join(outDir, `w${width}-scrolled.png`) });
      }

      await ctx.close();
    }

    await browser.close();
  } finally {
    preview.kill();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });