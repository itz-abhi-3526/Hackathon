import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';

const root = 'C:\\Users\\Arvin\\OneDrive\\Desktop\\iedc\\Hackathon';
const EDGE = String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;

function waitForPort(port, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://localhost:${port}`, (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error('Timeout'));
        setTimeout(check, 500);
      });
      req.end();
    };
    check();
  });
}

async function testUrl(label, sub) {
  const port = 5173;
  await page.goto(`http://localhost:${port}${sub}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3500);
  const body = (await page.textContent('body')).slice(0, 300).replace(/\s+/g, ' ').trim();
  console.log(`--- ${label} ---`);
  console.log('FINAL URL:', page.url());
  console.log('BODY:', body);
  console.log('ERRORS:', errors.length ? errors : 'none');
  return page.url();
}

let page, errors;
async function main() {
  const vite = spawn('npm', ['run', 'dev', '--', '--port', '5173', '--strictPort'], {
    cwd: root, shell: true, stdio: 'pipe',
  });
  vite.stderr.on('data', (d) => process.stderr.write(d));
  try {
    await waitForPort(5173);
    const browser = await chromium.launch({ executablePath: EDGE, headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await ctx.newPage();
    errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));

    await testUrl('dev /#admin', '/#admin');
    await testUrl('dev /admin', '/admin');
    await testUrl('dev /admin/teams', '/admin/teams');
    await browser.close();
  } finally {
    vite.kill();
    console.log('Done.');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });