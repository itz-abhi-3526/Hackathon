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

async function scrollTo(page, y, steps = 60) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 50);
    await page.waitForTimeout(25);
  }
  // final native jump for precision
  await page.evaluate((t) => window.scrollTo(0, t), y);
  await page.waitForTimeout(400);
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

    const run = async (label, viewport, targets) => {
      const page = await browser.newPage({ viewport });
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 40000 });
      await page.waitForSelector('#timeline', { timeout: 30000 });
      await page.waitForTimeout(1500);
      for (const [name, y] of targets) {
        await scrollTo(page, y);
        await page.screenshot({ path: path.join(OUT, `${label}-${name}.png`) });
        const info = await page.evaluate(() => {
          const exp = document.querySelector('#experience');
          const tl = document.querySelector('#timeline');
          const heading = document.querySelector('.timeline__heading');
          const stages = [...document.querySelectorAll('#experience .experience__stage')];
          const last = stages[stages.length - 1];
          const vp = document.querySelector('.timeline__viewport');
          return {
            scrollY: Math.round(window.scrollY),
            expBottom: exp ? Math.round(exp.getBoundingClientRect().bottom) : null,
            lastStageBottom: last ? Math.round(last.getBoundingClientRect().bottom) : null,
            tlTop: tl ? Math.round(tl.getBoundingClientRect().top) : null,
            headingTop: heading ? Math.round(heading.getBoundingClientRect().top) : null,
            vpPos: vp ? getComputedStyle(vp).position : null,
            vpTop: vp ? Math.round(vp.getBoundingClientRect().top) : null,
            staticClass: tl ? tl.classList.contains('timeline--static') : null,
          };
        });
        console.log(`${label}-${name}`, JSON.stringify(info));
      }
      await page.close();
    };

    await run('desk', { width: 1440, height: 900 }, [
      ['exp', 5200],
      ['exp-tl-edge', 5780],
      ['tl-head-in', 6110],
    ]);

    await run('laptop', { width: 1280, height: 800 }, [
      ['exp', 4960],
      ['tl-head-in', 6100],
    ]);

    await run('mobile', { width: 390, height: 844 }, [
      ['exp', 4300],
      ['tl-start', 5700],
      ['tl-begins', 6000],
      ['tl-head', 6300],
      ['tl-content', 8000],
      ['tl-end', 10000],
    ]);

    await browser.close();
  } finally {
    preview.kill();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });