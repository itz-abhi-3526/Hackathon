import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const PORT = 4173;

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
  preview.stdout.on('data', (d) => process.stdout.write(d));
  preview.stderr.on('data', (d) => process.stderr.write(d));

  try {
    await waitForPort(PORT);
    console.log('preview ready');

    const browser = await chromium.launch({ executablePath: EDGE, headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForSelector('#timeline', { timeout: 30000 });
    await page.waitForTimeout(1200);

    const samples = [];

    async function sample(label) {
      const d = await page.evaluate(() => {
        const tl = document.querySelector('#timeline');
        const vp = document.querySelector('.timeline__viewport');
        const track = document.querySelector('.timeline__track');
        const phases = [...document.querySelectorAll('.timeline__phase')];
        const cd = document.querySelector('.countdown');
        const cs = vp ? getComputedStyle(vp) : null;
        const tcs = track ? getComputedStyle(track) : null;
        const phasesInView = phases
          .map((p) => {
            const r = p.getBoundingClientRect();
            return {
              idx: (p.querySelector('.timeline__phase-index') || {}).textContent || '?',
              l: Math.round(r.left), r: Math.round(r.right),
            };
          })
          .filter((p) => p.r > 0 && p.l < window.innerWidth)
          .map((p) => p.idx);

        const tlR = tl.getBoundingClientRect();
        const cdR = cd.getBoundingClientRect();

        return {
          scrollY: Math.round(window.scrollY),
          scH: document.documentElement.scrollHeight,
          tlCount: document.querySelectorAll('#timeline').length,
          pinSpacers: document.querySelectorAll('.pin-spacer').length,
          tlTop: Math.round(tlR.top), tlBottom: Math.round(tlR.bottom), tlH: Math.round(tlR.height),
          cdBottom: Math.round(cdR.bottom),
          vpPos: cs ? cs.position : null,
          vpTop: vp ? Math.round(vp.getBoundingClientRect().top) : null,
          vpCS: tcs ? { transform: tcs.transform, width: Math.round(track.getBoundingClientRect().width) } : null,
          trackStyleTransform: track ? track.style.transform : null,
          activeIdx: phases.findIndex((p) => p.classList.contains('timeline__phase--active')),
          phasesInView,
        };
      });
      samples.push({ label, ...d });
    }

    await sample('start');
    let consecutive = 0;
    let prevPhases = '';
    for (let y = 0; y < 40000; y += 250) {
      await page.mouse.move(640, 450);
      await page.mouse.wheel(0, 250);
      await page.waitForTimeout(90);
      await sample(`y~${Math.round(y)}`);
      const key = samples[samples.length - 1].phasesInView.join(',');
      if (key === prevPhases) { consecutive += 1; } else { consecutive = 0; prevPhases = key; }
      if (consecutive > 14 && samples[samples.length - 1].scrollY > 6000) {
        break;
      }
    }
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -250);
      await page.waitForTimeout(90);
      await sample(`up${i}`);
    }

    console.log(JSON.stringify(samples, null, 1));
    await browser.close();
  } finally {
    preview.kill();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });