// Shared recorder helpers: crisp CDP screencast -> constant 30 fps mp4, plus a visible cursor with click ripples.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
export const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cursor overlay: a real DOM element that follows the real mouse events Playwright sends.
export const CURSOR_JS = `(() => {
  const mk = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div'); c.id = '__cur';
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7.2 1.6L9.6 20z" fill="#0C1424" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '-40px', top: '-40px', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-3px,-2px)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.35))' });
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: e.clientX - 22 + 'px', top: e.clientY - 22 + 'px', width: '44px', height: '44px', borderRadius: '50%', border: '3px solid #2E6BFF', background: 'rgba(46,107,255,.18)', zIndex: 2147483646, pointerEvents: 'none', transition: 'transform .45s ease-out, opacity .45s ease-out', transform: 'scale(.3)', opacity: '1' });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.4)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mk); else mk();
})();`;

export class Recorder {
  constructor(page, name, outDir, { w, h }) { Object.assign(this, { page, name, outDir, w, h, frames: [] }); }
  async start() {
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', async (f) => {
      this.frames.push({ t: f.metadata.timestamp, data: f.data });
      try { await this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: this.w, maxHeight: this.h, everyNthFrame: 1 });
    this.t0 = Date.now() / 1000;
  }
  // a marker log so the scene table can cite exact timestamps
  mark(label) { const t = Date.now() / 1000 - this.t0; (this.marks ??= []).push([t, label]); console.log(`[${this.name}] ${fmt(t)} ${label}`); }
  async stop() {
    await this.cdp.send('Page.stopScreencast');
    const end = Date.now() / 1000;
    const dir = join(this.outDir, `${this.name}_frames`); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const lines = [];
    this.frames.forEach((f, i) => {
      const file = join(dir, `${String(i).padStart(6, '0')}.jpg`).replaceAll('\\', '/');
      writeFileSync(file, Buffer.from(f.data, 'base64'));
      const next = i + 1 < this.frames.length ? this.frames[i + 1].t : end;
      lines.push(`file '${file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
    });
    lines.push(lines.at(-2));
    const list = join(dir, 'list.txt'); writeFileSync(list, lines.join('\n'));
    const out = join(this.outDir, `${this.name}.mp4`);
    // pad to even dims; 30 fps CFR; high quality so later speed-ups stay crisp
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=${this.w}:${this.h}:force_original_aspect_ratio=decrease,pad=${this.w}:${this.h}:(ow-iw)/2:(oh-ih)/2:color=white,fps=30,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', out]);
    writeFileSync(join(this.outDir, `${this.name}.marks.txt`), (this.marks ?? []).map(([t, l]) => `${fmt(t)}  ${l}`).join('\n') + '\n');
    rmSync(dir, { recursive: true, force: true });
    console.log(`[${this.name}] wrote ${out} (${this.frames.length} frames, first frame offset ${(this.frames[0].t - this.t0).toFixed(2)}s)`);
    return out;
  }
}
export const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;

// Smooth, eased cursor travel to an element, then a real click.
export async function glide(page, target, { click = true, ms = 650, dx = 0, dy = 0 } = {}) {
  const box = await target.boundingBox();
  const to = { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
  const from = page.__m ?? { x: to.x - 200, y: to.y + 160 };
  const n = Math.max(12, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) {
    const k = i / n, e = 1 - Math.pow(1 - k, 3);
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    await sleep(ms / n);
  }
  page.__m = to;
  if (click) { await sleep(120); await page.mouse.down(); await sleep(70); await page.mouse.up(); }
}

export async function smoothScroll(page, dy, ms = 900) {
  const n = Math.round(ms / 16);
  for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy / n); await sleep(16); }
}
