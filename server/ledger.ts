// Hash-chained audit trail. TAMPER-EVIDENT against partial edits only (see docs/THREAT-MODEL.md); seal.ts adds the out-of-DB checkpoint.
import { createHash } from 'node:crypto';
import type { Db } from './db.ts';

export const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

export const canon = (v: unknown): string =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : x,
  );

export const hashArgs = (tool: string, cap: string, cents: number, items?: { itemId: string; qty: number }[]): string =>
  sha(canon({ tool, cap, cents, items: items ? [...items].sort((a, b) => (a.itemId < b.itemId ? -1 : 1)) : undefined }));

export const GENESIS = '0'.repeat(64);

export function ledger(db: Db, actionId: string, event: string, payload: object, ts: number): void {
  const prev = db.val<string>('SELECT hash FROM ledger ORDER BY seq DESC LIMIT 1') ?? GENESIS;
  const hash = sha(prev + canon({ actionId, event, payload, ts }));
  db.run('INSERT INTO ledger(action_id,event,payload_json,prev_hash,hash,created_at) VALUES (?,?,?,?,?,?)', actionId, event, canon(payload), prev, hash, ts);
}

export type ChainResult = { ok: true; rows: number; head: string } | { ok: false; brokenAt: number };

export function verifyChain(db: Db): ChainResult {
  let prev = GENESIS;
  let n = 0;
  for (const r of db.all('SELECT * FROM ledger ORDER BY seq')) {
    const want = sha(prev + canon({ actionId: r.action_id, event: r.event, payload: JSON.parse(r.payload_json), ts: r.created_at }));
    if (r.prev_hash !== prev || r.hash !== want) return { ok: false, brokenAt: r.seq };
    prev = r.hash;
    n++;
  }
  return { ok: true, rows: n, head: prev };
}

/** Head hash after the first `n` rows (what a published head commits to). */
export function headAt(db: Db, n: number): string | null {
  if (n === 0) return GENESIS;
  const r = db.one<{ hash: string }>('SELECT hash FROM ledger ORDER BY seq LIMIT 1 OFFSET ?', n - 1);
  return r?.hash ?? null;
}

/** Checks a previously published (rows, head) pair: the chain must still be valid and the hash at that row count unchanged. Appending later rows is fine; rewriting history is not. */
export function verifyPublished(db: Db, rows: number, head: string): { ok: boolean; why?: string } {
  const c = verifyChain(db);
  if (!c.ok) return { ok: false, why: `chain broken at row ${c.brokenAt}` };
  const h = headAt(db, rows);
  if (h === null) return { ok: false, why: `ledger has only ${c.rows} rows, fewer than the published ${rows}` };
  return h === head ? { ok: true } : { ok: false, why: `hash at row ${rows} differs from the published head: history was rewritten` };
}
