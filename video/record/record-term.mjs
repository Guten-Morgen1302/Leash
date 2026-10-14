// Terminal take: a browser terminal (xterm.js) that streams the REAL stdout of real commands run in the repo.
// Nothing is typed into the output; the page only types the command line, then shows exactly what the process prints.
// usage: node record-term.mjs <outDir> <leashUrl>
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { CHROME, Recorder, sleep } from './lib.mjs';

const [OUT, LEASH] = process.argv.slice(2);
const REPO = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const CMDS = { test: ['npm', ['test']], replay: ['npm', ['run', 'replay']] };

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>html,body{margin:0;height:100%;background:#0b0d12}#t{position:absolute;inset:22px 26px}.xterm-viewport{overflow:hidden!important}</style></head>
<body><div id="t"></div>
<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.js"></script>
<script>
const term = new Terminal({ fontFamily: 'JetBrains Mono', fontSize: 18, lineHeight: 1.25, convertEol: true, cursorBlink: true, scrollback: 5000,
  theme: { background: '#0b0d12', foreground: '#d8dee9', cursor: '#7aa2ff', green: '#4ade80', red: '#f87171', blue: '#7aa2ff', cyan: '#67e8f9', yellow: '#fbbf24', brightBlack: '#6b7280' } });
const fit = new FitAddon.FitAddon(); term.loadAddon(fit);
document.fonts.load('18px "JetBrains Mono"').then(() => { term.open(document.getElementById('t')); fit.fit(); window.__ready = true; });
const prompt = () => term.write('\\x1b[38;5;111mleash\\x1b[0m \\x1b[38;5;245m~/paypal-hackathon-devpost\\x1b[0m \\x1b[38;5;111m$\\x1b[0m ');
window.runCmd = (id, line) => new Promise(async (res) => {
  prompt();
  for (const ch of line) { term.write(ch); await new Promise((r) => setTimeout(r, 55 + Math.random() * 45)); }
  await new Promise((r) => setTimeout(r, 350)); term.write('\\r\\n');
  const es = new EventSource('/run?c=' + id);
  es.onmessage = (e) => term.write(JSON.parse(e.data));
  es.addEventListener('done', () => { es.close(); term.write('\\r\\n'); res(); });
});
</script></body></html>`;

const srv = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') return res.writeHead(200, { 'content-type': 'text/html' }), res.end(PAGE);
  if (u.pathname === '/run' && CMDS[u.searchParams.get('c')]) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const [cmd, args] = CMDS[u.searchParams.get('c')];
    const p = spawn(cmd, args, { cwd: REPO, shell: true, env: { ...process.env, FORCE_COLOR: '1', LEASH_URL: LEASH, LEASH_CHROMIUM: CHROME } });
    const send = (b) => res.write(`data: ${JSON.stringify(b.toString())}\n\n`);
    p.stdout.on('data', send); p.stderr.on('data', send);
    p.on('close', (code) => { res.write(`event: done\ndata: ${code}\n\n`); res.end(); console.log(`${u.searchParams.get('c')} exited ${code}`); });
    return;
  }
  res.writeHead(404).end();
}).listen(4499);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4499/'); await page.waitForFunction(() => window.__ready); await sleep(500);
const rec = new Recorder(page, 'terminal', OUT, { w: 1920, h: 1080 });
await rec.start();
await sleep(900);
rec.mark('$ npm test');
await page.evaluate(() => window.runCmd('test', 'npm test'));
rec.mark('npm test finished (summary on screen)');
await sleep(3500);
await page.evaluate(() => term.clear());
rec.mark('$ npm run replay');
await page.evaluate(() => window.runCmd('replay', 'npm run replay'));
rec.mark('replay finished');
await sleep(3500);
rec.mark('end');
await rec.stop();
await browser.close(); srv.close();
