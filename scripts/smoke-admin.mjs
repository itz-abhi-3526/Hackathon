import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
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
  const vite = spawn('npm', ['run', 'preview', '--', '--port', '4173', '--strictPort'], {
    cwd: root,
    shell: true,
    stdio: 'pipe',
  });
  vite.stderr.on('data', (d) => process.stderr.write(d));

  try {
    await waitForPort(4173);
    console.log('Preview ready on :4173');

    const browser = await chromium.launch({ executablePath: EDGE, headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message.slice(0, 300)}`));

    await page.goto('http://localhost:4173', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);
    const siteTitle = await page.title();
    const bodyText = (await page.textContent('body')).slice(0, 120).replace(/\s+/g, ' ').trim();

    await page.goto('http://localhost:4173/#admin', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);
    const adminText = await page.textContent('body');
    const hasLogin = /SIGN IN|ADMIN ACCESS|EMAIL|PASSWORD|OPERATIONS OVERVIEW/i.test(adminText);
    await page.screenshot({ path: path.join(root, 'screenshots', 'smoke-admin.png'), fullPage: true });

    console.log(`SITE title: ${siteTitle}`);
    console.log(`SITE body: ${bodyText}`);
    console.log(`ADMIN login-ish present: ${hasLogin}`);
    const adminSnippet = adminText.slice(0, 200).replace(/\s+/g, ' ').trim();
    console.log(`ADMIN body: ${adminSnippet}`);
    console.log(`CONSOLE ERRORS: ${consoleErrors.length}`);
    for (const e of consoleErrors) console.log(`  -> ${e}`);

    await browser.close();
    if (consoleErrors.length) process.exitCode = 1;
  } finally {
    vite.kill();
    console.log('Done.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});