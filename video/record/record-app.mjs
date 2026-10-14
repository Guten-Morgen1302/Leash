// Drives the real Leash UI end to end and records it: desktop take (1920x1080) + phone take of the approval page.
// usage: node record-app.mjs <baseUrl> <outDir>
import { chromium } from 'playwright-core';
import { CHROME, CURSOR_JS, Recorder, glide, sleep, smoothScroll } from './lib.mjs';

const [B, OUT] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--font-render-hinting=none'] });

// Desktop: 1440x810 CSS px at DPR 4/3 = exactly 1920x1080 device px
const dctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, colorScheme: 'light' });
await dctx.addInitScript(CURSOR_JS);
const d = await dctx.newPage();
await d.goto(`${B}/demo`); await d.waitForLoadState('networkidle'); await d.getByRole('button', { name: /Run both lanes/ }).waitFor();
await sleep(800);
const rec = new Recorder(d, 'desktop', OUT, { w: 1920, h: 1080 });
await rec.start();
await d.mouse.move(980, 580); d.__m = { x: 980, y: 580 };
await sleep(1200);

// --- Ticket 2: prompt injection
rec.mark('demo: ticket 2 (injected) preselected; cursor reads the hidden SYSTEM NOTE');
await glide(d, d.locator('.ticket'), { click: false, ms: 900, dy: 22 });
await sleep(2200);
rec.mark('click Run both lanes (ticket 2)');
await glide(d, d.getByRole('button', { name: /Run both lanes/ }));
await d.getByText('NOT REFUNDED', { exact: true }).waitFor();
rec.mark('ticket 2 result: unguarded $200 vs BLOCKED R-HARD-MAX');
await glide(d, d.getByText('R-HARD-MAX', { exact: true }), { click: false, ms: 900 });
await sleep(3500);

// --- Ticket 1: legit refund allowed
rec.mark('select ticket 1 (Wrong size)');
await glide(d, d.getByRole('button', { name: /1\. Wrong size/ }));
await sleep(1200);
await glide(d, d.getByRole('button', { name: /Run both lanes/ }));
await d.getByText('R-ALLOW', { exact: true }).waitFor();
rec.mark('ticket 1 result: both lanes $18, R-ALLOW');
await sleep(3000);

// --- Ticket 3: escalation
rec.mark('select ticket 3 (Jacket never arrived)');
await glide(d, d.getByRole('button', { name: /3\. Jacket/ }));
await sleep(1200);
await glide(d, d.getByRole('button', { name: /Run both lanes/ }));
await d.getByText('WAITING FOR APPROVAL', { exact: true }).waitFor();
rec.mark('ticket 3 result: WAITING FOR APPROVAL, R-ACTION-CAP');
await sleep(2500);
const href = await d.getByRole('link', { name: /Open approval page/ }).getAttribute('href');

// --- Phone take: the approval page as a phone shows it (390x844 @3x)
rec.mark('(desktop idle: a human approves on the phone)');
await glide(d, d.getByRole('link', { name: /Open approval page/ }), { click: false, ms: 700 });
const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'light' });
await pctx.addInitScript(CURSOR_JS);
const p = await pctx.newPage();
await p.goto(`${B}${href}`); await p.getByRole('button', { name: 'Approve' }).waitFor(); await p.waitForLoadState('networkidle');
await sleep(600);
const prec = new Recorder(p, 'phone', OUT, { w: 1170, h: 2532 });
await prec.start();
prec.mark('approval page: $75 Wool jacket, R-ACTION-CAP, advisory summary, countdown');
await p.mouse.move(300, 760); p.__m = { x: 300, y: 760 };
await sleep(3800);
prec.mark('tap Approve');
await glide(p, p.getByRole('button', { name: 'Approve' }), { ms: 800 });
await p.getByText(/Approved\. Nothing has been refunded yet/).waitFor();
prec.mark('Approved. Nothing refunded yet: agent must retry; grant works once');
await sleep(4200);
await prec.stop();
await pctx.close();

// --- back on desktop: the agent retries the same call, the single-use grant lets it through
rec.mark('agent retries after approval');
await glide(d, d.getByRole('button', { name: /Agent retries after approval/ }), { ms: 800 });
await d.getByText('R-APPROVED', { exact: true }).waitFor();
rec.mark('ticket 3 retry: REFUNDED $75, R-APPROVED; exposure $75 of $400');
await sleep(3500);

// --- Ledger
rec.mark('nav: Ledger');
await glide(d, d.getByRole('link', { name: 'Ledger', exact: true }));
await d.getByText(/Chain verified/).waitFor(); await sleep(400);
rec.mark('ledger: chain verified, head hash, rows');
await glide(d, d.getByText(/Chain verified/), { click: false, ms: 800 });
await sleep(2500);
await glide(d, d.getByText(/Head after/), { click: false, ms: 700, dx: 120 });
await sleep(2500);

// --- Mandate
rec.mark('nav: Mandate');
await glide(d, d.getByRole('link', { name: 'Mandate', exact: true }));
await d.getByText(/may refund up to/).first().waitFor(); await sleep(400);
rec.mark('mandate: plain-language limits');
await glide(d, d.getByText(/Nothing above/).first(), { click: false, ms: 900 });
await sleep(4000);

// --- Author
rec.mark('nav: Author');
await glide(d, d.getByRole('link', { name: 'Author', exact: true }));
await d.getByRole('button', { name: 'apparel' }).waitFor(); await sleep(800);
rec.mark('author: pick apparel sample policy');
await glide(d, d.getByRole('button', { name: 'apparel' }));
await sleep(2200);
rec.mark('author: Compile draft');
await glide(d, d.getByRole('button', { name: 'Compile draft' }));
await d.getByText('What Leash would enforce').waitFor({ timeout: 90000 });
rec.mark('author: draft compiled (playback + NOT enforced)');
await sleep(1500);
await smoothScroll(d, 520, 1400);
await sleep(4500);

rec.mark('end');
await rec.stop();
await browser.close();
