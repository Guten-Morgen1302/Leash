#!/usr/bin/env node
// node scripts/ledger-head.mjs            -> prints the current (rows, head) pair to publish (commit it, post it, put it in the README)
// node scripts/ledger-head.mjs --verify <rows> <head>  -> checks a previously published pair against the DB: appends are fine, rewrites are not
import { openDb } from '../server/db.ts';
import { verifyChain, verifyPublished } from '../server/ledger.ts';

const db = await openDb(process.env.LEASH_DB ?? 'leash.db');
if (process.argv[2] === '--verify') {
  const r = verifyPublished(db, Number(process.argv[3]), String(process.argv[4]));
  console.log(r.ok ? 'OK: the ledger still contains the published head (history not rewritten).' : `MISMATCH: ${r.why}`);
  process.exit(r.ok ? 0 : 1);
}
const c = verifyChain(db);
if (!c.ok) { console.error(`Chain broken at row ${c.brokenAt}: do not publish.`); process.exit(1); }
console.log(`rows=${c.rows} head=${c.head}\nPublish this pair somewhere you control and a verifier can read (a commit, a post). Check later with: node scripts/ledger-head.mjs --verify ${c.rows} ${c.head}`);
db.close();
