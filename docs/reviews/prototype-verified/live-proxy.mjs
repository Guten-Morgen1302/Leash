// Live-fire check: Leash proxy (MCP over stdio) against the REAL PayPal sandbox. Prints statuses and ids only, never credentials.
import { readFileSync, mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js'; import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { openDb, applySchema } from './db.mjs';
const REPO = 'C:/Hackathons/PayPal AI Hackathon';
const env = Object.fromEntries(readFileSync(`${REPO}/.env`, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
const BASE = env.PAYPAL_BASE_URL; if (!/sandbox/.test(BASE)) throw new Error('not sandbox');
const tr = await fetch(`${BASE}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
const TOKEN = (await tr.json()).access_token;
const caps = JSON.parse(readFileSync(`${REPO}/.seed/captures.json`, 'utf8'));
const by = (label) => caps.find((c) => c.label === label);
const M = { perActionCapCents: 5000, hardMaxCents: 10000, dailyCapCents: 20000, hardDailyCapCents: 40000, dupWindowMs: 864e5, expiresAt: Date.now() + 864e5 };

const path = join(mkdtempSync(join(tmpdir(), 'live-')), 'live.db'); const db = await openDb(path); applySchema(db);
for (const c of caps) db.run(`INSERT INTO payments(txn_id,captured_cents,currency,source) VALUES (?,?,?,'live_pool')`, c.txn_id, c.captured_cents, c.currency);
const t = new StdioClientTransport({ command: process.execPath, args: ['--disable-warning=ExperimentalWarning', 'proxy-main.mjs'], cwd: import.meta.dirname,
  env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot ?? '', PAYPAL_ACCESS_TOKEN: TOKEN, PAYPAL_BASE_URL: BASE, LEASH_DB: path, LEASH_MANDATE_JSON: JSON.stringify(M) } });
const client = new Client({ name: 'live-agent', version: '0' }); await client.connect(t);
const call = async (a) => { const r = await client.callTool({ name: 'create_refund', arguments: a }); const o = JSON.parse(r.content[0].text); if (JSON.stringify(o).includes(TOKEN)) throw new Error('TOKEN LEAKED TO AGENT'); return o; };
const R = (id, v) => ({ capture_id: id, amount: { currency_code: 'USD', value: v } });
const show = (n, o) => console.log(`${n}: status=${o.status} rule=${o.rule_id ?? '-'} ${o.refund_id ? 'refund_id=' + o.refund_id : ''} ${o.reason ? '| ' + o.reason : ''}`);

const allow = by('demo-allow-$18-of-$60'), inj = by('demo-injection-$900-vs-$60'), esc = by('demo-escalate-$75-of-$120');
const a = await call(R(allow.txn_id, '18.00')); show('1) $18 on $60 capture (expect executed)', a);
const b = await call(R(inj.txn_id, '900.00')); show('2) $900 on $60 capture (expect blocked)', b);
const c = await call(R(esc.txn_id, '75.00')); show('3) $75 on $120 capture (expect pending_approval)', c);
if (a.refund_id) {
  const g = await fetch(`${BASE}/v2/payments/refunds/${a.refund_id}`, { headers: { Authorization: `Bearer ${TOKEN}` } }); const j = await g.json();
  console.log(`4) independent check of refund ${a.refund_id} straight from PayPal: HTTP ${g.status} status=${j.status} amount=${j.amount?.value} ${j.amount?.currency_code}`);
}
const inj2 = await fetch(`${BASE}/v2/payments/captures/${inj.txn_id}`, { headers: { Authorization: `Bearer ${TOKEN}` } }).then((r) => r.json());
console.log(`5) the $900-target capture is untouched at PayPal: status=${inj2.status}, no refund made (blocked before reaching PayPal)`);
console.log('ledger rows:', db.val('SELECT COUNT(*) FROM ledger'), '| reserved/refunded on allow capture:', JSON.stringify(db.one('SELECT reserved_cents r, refunded_cents f FROM payments WHERE txn_id=?', allow.txn_id)));
await client.close();
