// Ledger seal: closes tail-truncation and DB-only full-rewrite. Key + seal file live OUTSIDE the database.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { verifyChain } from './dispatch.mjs';

const mac = (key, count, head) => createHmac('sha256', key).update(`${count}|${head}`).digest('hex');

export function seal(db, key, file) {
  const v = verifyChain(db);
  if (!v.ok) throw new Error(`refusing to seal a broken chain (row ${v.brokenAt})`);
  const rec = { count: v.rows, head: v.head, mac: mac(key, v.rows, v.head), at: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(rec)); return rec;
}

export function verifySealed(db, key, file) {
  let rec; try { rec = JSON.parse(readFileSync(file, 'utf8')); } catch { return { ok: false, why: 'seal file missing or unreadable' }; }
  const want = Buffer.from(mac(key, rec.count, rec.head), 'hex'), got = Buffer.from(String(rec.mac), 'hex');
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, why: 'seal MAC invalid (forged or wrong key)' };
  const v = verifyChain(db); if (!v.ok) return { ok: false, why: `chain broken at row ${v.brokenAt}` };
  if (v.rows < rec.count) return { ok: false, why: `truncated: ${v.rows} rows, sealed ${rec.count}` };
  const atSeal = db.one('SELECT hash FROM ledger ORDER BY seq LIMIT 1 OFFSET ?', rec.count - 1);
  if (rec.count > 0 && atSeal?.hash !== rec.head) return { ok: false, why: 'history before the seal was rewritten' };
  return { ok: true, rows: v.rows, sealedRows: rec.count, appendedSinceSeal: v.rows - rec.count };
}
