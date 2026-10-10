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
