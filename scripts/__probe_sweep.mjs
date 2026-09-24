import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const PORT = 4178;

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
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForSelector('#timeline', { timeout: 30000 });
    await page.waitForTimeout(2000);

    // scroll to just before the experience section
    await page.evaluate(() => window.scrollTo(0, 4800));
    await page.waitForTimeout(900);

    let worst = [];
    let frames = 0;
    const sample = async (sweep) => {
      const d = await page.evaluate(() => {
        const r = (el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
        const stages = [...document.querySelectorAll('#experience .experience__stage')].map(r);
        const vp = document.querySelector('.timeline__viewport');
        const vpr = r(vp);
        const head = document.querySelector('.timeline__heading') ? r(document.querySelector('.timeline__heading')) : null;
        // any stage card visually intersecting the timeline viewport?
        const stageHitsVp = stages.filter((s) => !(s.bottom <= vpr.top || s.top >= vpr.bottom));
        const headHitsStage = head ? stages.filter((s) => !(s.bottom <= head.top || s.top >= head.bottom)) : [];
        let topAtStageCenter = null;
        if (stages.length) {
          const center = stages[0];
          const cxp = (center.left + center.right) / 2;
          const cyp = (center.top + center.bottom) / 2;
          const hits = document.elementsFromPoint(cxp, cyp).slice(0, 3).map((el) => (el.className && String(el.className)) || el.tagName);
          topAtStageCenter = hits;
        }
        return {
          scrollY: Math.round(window.scrollY),
          stageHitsVp: stageHitsVp.map((s) => s.top + '->' + s.bottom),
          headHitsStage: headHitsStage.length,
          topAtStageCenter,
        };
      });
      frames++;
      if (d.stageHitsVp.length || d.headHitsStage > 0) {
        worst.push({ ...d, sweep });
        console.log('HIT', JSON.stringify(d, null, 0));
      }
    };

    // sweep 1: forward
    for (let i = 0; i < 200; i++) {
      await page.mouse.wheel(0, 45);
      await page.waitForTimeout(20);
      if (i % 2 === 0) await sample('fwd');
    }
    // sweep 2: backward
    for (let i = 0; i < 200; i++) {
      await page.mouse.wheel(0, -45);
      await page.waitForTimeout(20);
      if (i % 2 === 0) await sample('back');
    }

    console.log(JSON.stringify({ frames, hitFrames: worst.length, hits: worst.slice(0, 20) }, null, 1));
    await browser.close();
  } finally {
    preview.kill();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });