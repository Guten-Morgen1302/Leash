// Ledger seal: HMAC(key, count|head) written OUTSIDE the database. Detects tail truncation and DB-only rewrites.
// LIMIT (documented, tested): an attacker holding BOTH the database and the key can re-seal.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Db } from './db.ts';
import { verifyChain } from './ledger.ts';

const mac = (key: string, count: number, head: string): string => createHmac('sha256', key).update(`${count}|${head}`).digest('hex');

export interface SealRecord {
  count: number;
  head: string;
  mac: string;
  at: string;
}

export function seal(db: Db, key: string, file: string): SealRecord {
  const v = verifyChain(db);
  if (!v.ok) throw new Error(`refusing to seal a broken chain (row ${v.brokenAt})`);
  const rec: SealRecord = { count: v.rows, head: v.head, mac: mac(key, v.rows, v.head), at: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(rec));
  return rec;
}

export type SealResult =
  | { ok: true; rows: number; sealedRows: number; appendedSinceSeal: number }
  | { ok: false; why: string };

export function verifySealed(db: Db, key: string, file: string): SealResult {
  let rec: SealRecord;
  try {
    rec = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, why: 'seal file missing or unreadable' };
  }
  const want = Buffer.from(mac(key, rec.count, rec.head), 'hex');
  const got = Buffer.from(String(rec.mac), 'hex');
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, why: 'seal MAC invalid (forged or wrong key)' };
  const v = verifyChain(db);
  if (!v.ok) return { ok: false, why: `chain broken at row ${v.brokenAt}` };
  if (v.rows < rec.count) return { ok: false, why: `truncated: ${v.rows} rows, sealed ${rec.count}` };
  const atSeal = db.one<{ hash: string }>('SELECT hash FROM ledger ORDER BY seq LIMIT 1 OFFSET ?', rec.count - 1);
  if (rec.count > 0 && atSeal?.hash !== rec.head) return { ok: false, why: 'history before the seal was rewritten' };
  return { ok: true, rows: v.rows, sealedRows: rec.count, appendedSinceSeal: v.rows - rec.count };
}
