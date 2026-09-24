import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const PORT = 4177;

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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForSelector('#timeline', { timeout: 30000 });
    await page.waitForTimeout(1500);

    async function sample(label) {
      const d = await page.evaluate(() => {
        const y = (el) => el && Math.round(el.getBoundingClientRect().top);
        const b = (el) => el && Math.round(el.getBoundingClientRect().bottom);
        const exp = document.querySelector('#experience');
        const expEls = [...document.querySelectorAll('#experience .experience__stage')];
        const tl = document.querySelector('#timeline');
        const vp = document.querySelector('.timeline__viewport');
        const head = document.querySelector('.timeline__stage-head');
        const hd = document.querySelector('.timeline__heading');
        const spacers = [...document.querySelectorAll('.pin-spacer')];
        const lastStage = expEls[expEls.length - 1];
        const expStyle = exp ? getComputedStyle(exp) : null;
        const tlStyle = tl ? getComputedStyle(tl) : null;
        return {
          scrollY: Math.round(window.scrollY),
          scH: document.documentElement.scrollHeight,
          exp: exp ? { top: y(exp), bottom: b(exp), h: Math.round(exp.getBoundingClientRect().height), padTop: expStyle.paddingTop, padBottom: expStyle.paddingBottom, overflow: expStyle.overflow, pos: expStyle.position } : null,
          lastStage: lastStage ? { top: y(lastStage), bottom: b(lastStage) } : null,
          lastStageCount: expEls.length,
          tl: tl ? { top: y(tl), bottom: b(tl), h: Math.round(tl.getBoundingClientRect().height), overflow: tlStyle.overflow, pos: tlStyle.position } : null,
          vpPos: vp ? getComputedStyle(vp).position : null,
          vp: vp ? { top: y(vp), h: Math.round(vp.getBoundingClientRect().height) } : null,
          head: head ? { top: y(head), bottom: b(head) } : null,
          heading: hd ? { top: y(hd) } : null,
          spacers: spacers.map((s) => ({ h: Math.round(s.getBoundingClientRect().height), top: y(s), pos: getComputedStyle(s).position, parent: s.parentElement ? s.parentElement.id || s.parentElement.className : null })),
          staticClass: tl ? tl.classList.contains('timeline--static') : null,
          overlaps: (() => {
            if (!exp || !hd) return [];
            const hr = hd.getBoundingClientRect();
            return expEls.map((s) => {
              const r = s.getBoundingClientRect();
              const hit = !(r.bottom <= hr.top || r.top >= hr.bottom);
              return hit;
            }).filter(Boolean).length;
          })(),
        };
      });
      console.log(JSON.stringify({ label, ...d }, null, 1));
    }

    await sample('entry');
    for (let i = 0; i < 40; i++) {
      await page.mouse.move(640, 450);
      await page.mouse.wheel(0, 130);
      await page.waitForTimeout(60);
    }
    await sample('mid');
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 130);
      await page.waitForTimeout(60);
    }
    await sample('wayPast');
    await browser.close();
  } finally {
    preview.kill();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });