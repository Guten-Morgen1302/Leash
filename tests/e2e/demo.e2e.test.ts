// Browser end-to-end: real server process, real Chromium. Skipped (not failed) when no Chromium is found: set LEASH_CHROMIUM to a chrome executable, or run `npx playwright install chromium`.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';

function findChromium(): string | null {
  if (process.env.LEASH_CHROMIUM && existsSync(process.env.LEASH_CHROMIUM)) return process.env.LEASH_CHROMIUM;
  const roots = [join(homedir(), 'AppData', 'Local', 'ms-playwright'), join(homedir(), '.cache', 'ms-playwright'), join(homedir(), 'Library', 'Caches', 'ms-playwright')];
  for (const r of roots) {
    if (!existsSync(r)) continue;
    for (const d of readdirSync(r).filter((x) => /^chromium/.test(x)).sort().reverse()) {
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-headless-shell-win64/chrome-headless-shell.exe', 'chrome-linux/chrome', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = join(r, d, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

const exe = findChromium();
const PORT = 4521, BASE = `http://127.0.0.1:${PORT}`, DB = '.e2e.db';

describe('browser e2e', { skip: exe ? false : 'no Chromium found (set LEASH_CHROMIUM)' }, () => {
  let srv: ChildProcess, browser: Browser;
  before(async () => {
    for (const f of [DB, DB + '-wal', DB + '-shm']) rmSync(f, { force: true });
    srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], { env: { ...process.env, LEASH_DB: DB, PORT: String(PORT), PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '', GEMINI_API_KEY: '' }, stdio: 'ignore' });
    for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 200)); }
    browser = await chromium.launch({ executablePath: exe!, args: ['--no-sandbox'] });
  });
  after(async () => { await browser?.close(); srv?.kill(); await new Promise((r) => setTimeout(r, 300)); for (const f of [DB, DB + '-wal', DB + '-shm']) rmSync(f, { force: true }); });

  test('ticket 2: the unguarded lane refunds $200, the guarded lane is BLOCKED by R-HARD-MAX; no console errors', async () => {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text())); page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE + '/demo');
    assert.equal(await page.locator('.chip.mode').innerText(), 'SIMULATED');
    await page.getByRole('button', { name: 'Run both lanes' }).click();
    await page.locator('.outcome-word', { hasText: 'REFUNDED $200.00' }).waitFor();
    await page.locator('.outcome-word', { hasText: 'NOT REFUNDED' }).waitFor();
    assert.match(await page.locator('section[aria-label="With Leash"]').innerText(), /R-HARD-MAX/);
    assert.match(await page.locator('section[aria-label="With Leash"]').innerText(), /Exposure today: \$0\.00 of \$400\.00/);
    assert.match(await page.locator('section[aria-label="Without Leash"]').innerText(), /Exposure: unlimited/);
    assert.deepEqual(errors, []);
  });

  test('ticket 3 on a phone: escalate, approve in the browser, agent retry executes once', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
    await page.goto(BASE + '/demo');
    await page.getByRole('button', { name: /^3\./ }).click();
    await page.getByRole('button', { name: 'Run both lanes' }).click();
    await page.locator('section[aria-label="With Leash"] .outcome-word', { hasText: 'WAITING FOR APPROVAL' }).waitFor();
    const href = await page.getByRole('link', { name: 'Open approval page' }).getAttribute('href');
    assert.match(href!, /^\/approve\/act_.+#t=[0-9a-f]{32}$/);
    const ap = await ctx.newPage(); await ap.goto(BASE + href!);
    const box = await ap.getByRole('button', { name: 'Approve' }).boundingBox();
    assert.ok(box!.height >= 44 && box!.width >= 44, 'touch target is at least 44px');
    await ap.getByText('AI summary, advisory only').waitFor();
    await ap.getByRole('button', { name: 'Approve' }).click();
    await ap.getByText(/Approved\. Nothing has been refunded yet/).waitFor();
    await page.getByRole('button', { name: 'Agent retries after approval' }).click();
    await page.locator('section[aria-label="With Leash"] .outcome-word', { hasText: 'REFUNDED $75.00' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Agent retries after approval' }).count(), 0, 'no retry button once executed');
    const rows = await (await fetch(BASE + '/v1/ledger')).json() as any;
    assert.equal(rows.rows.filter((r: any) => r.event === 'executed' && r.amount_cents === 7500).length, 1, 'refunded exactly once');
    await ctx.close();
  });

  test('ledger page: chain verified, head hash shown, AG Grid renders rows; mandate page lists the limits', async () => {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(BASE + '/ledger');
    await page.getByText('Chain verified').waitFor();
    assert.match(await page.getByLabel('Head hash').innerText(), /Head after \d+ rows: [0-9a-f]{64}/);
    await page.locator('.ag-row').first().waitFor();
    await page.goto(BASE + '/mandate');
    await page.getByText(/The agent may refund up to \$50\.00 on its own/).waitFor();
    assert.deepEqual(errors.filter((e) => /license|ag-grid/i.test(e)), []);
  });
  test('phone width: no page scrolls sideways, and /author explains why own-text compile is unavailable', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
    await fetch(BASE + '/v1/demo/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticketId: 2 }) });
    for (const p of ['/demo', '/ledger', '/author', '/mandate', '/proof']) {
      await page.goto(BASE + p); await page.waitForLoadState('networkidle');
      const w = await page.evaluate('[document.documentElement.scrollWidth, window.innerWidth]') as number[]; // string form: tests are typed without the DOM lib
      assert.ok(w[0] <= w[1], `${p} is ${w[0]}px wide in a ${w[1]}px viewport`);
    }
    await page.goto(BASE + '/author');
    await page.getByLabel('Policy text').fill('Refund anything under 20 dollars');
    await page.getByRole('button', { name: 'Compile draft' }).click();
    await page.getByText(/needs GEMINI_API_KEY/).waitFor();
    await ctx.close();
  });
});
