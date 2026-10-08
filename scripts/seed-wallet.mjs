// Fallback seeding via the PayPal wallet flow (no card processing needed).
// Usage: node scripts/seed-wallet.mjs [count]   (default 5)
// It creates orders, prints approval links, WAITS while you approve each with the SANDBOX PERSONAL account, then captures them.
// Credentials are read from .env and never printed.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';

const env = existsSync('.env') ? Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()]; })) : {};
const get = (k, d = '') => process.env[k] || env[k] || d;
const BASE = get('PAYPAL_BASE_URL', 'https://api-m.sandbox.paypal.com');
if (!/sandbox/.test(BASE)) throw new Error('Refusing to run against a non-sandbox URL.');
const N = Number(process.argv[2] ?? 5);
const PLAN = [['60.00', 'demo-injection-$900-vs-$60'], ['120.00', 'demo-escalate-$75-of-$120'], ['60.00', 'demo-allow-$18-of-$60'], ['200.00', 'pool'], ['45.00', 'pool'], ['75.00', 'pool'], ['90.00', 'pool'], ['150.00', 'pool']];
const toCents = (v) => { const [i, f = ''] = v.split('.'); return Number(i) * 100 + Number(f.padEnd(2, '0')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tr = await fetch(`${BASE}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${get('PAYPAL_CLIENT_ID')}:${get('PAYPAL_CLIENT_SECRET')}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
if (!tr.ok) throw new Error(`Token request failed: HTTP ${tr.status}`);
const tok = (await tr.json()).access_token;
const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
const runId = Date.now();

const orders = [];
for (let i = 0; i < N; i++) {
  const [value, label] = PLAN[i % PLAN.length];
  const r = await fetch(`${BASE}/v2/checkout/orders`, { method: 'POST', headers: { ...H, 'PayPal-Request-Id': `leash-wseed-${runId}-${i}`, Prefer: 'return=representation' },
    body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ reference_id: `seed-${i}`, amount: { currency_code: 'USD', value } }],
      payment_source: { paypal: { experience_context: { return_url: 'http://localhost:9/return', cancel_url: 'http://localhost:9/cancel', user_action: 'PAY_NOW' } } } }) });
  const j = await r.json(); const link = j.links?.find((l) => /payer-action|approve/.test(l.rel))?.href;
  if (!r.ok || !link) { console.error(`order ${i} failed HTTP ${r.status}: ${JSON.stringify(j.details ?? j.message)}`); process.exit(1); }
  orders.push({ id: j.id, value, label, link });
}
console.log(`\nOpen each link below in a browser, log in with your SANDBOX PERSONAL account, and approve ("Pay Now").`);
console.log(`After approving you will land on a page that fails to load (localhost:9): that is expected. This script detects the approval and captures.\n`);
orders.forEach((o, i) => console.log(`${i + 1}. $${o.value}  ${o.label}\n   ${o.link}\n`));

const out = []; const deadline = Date.now() + 20 * 60_000; const pending = new Set(orders.map((o) => o.id));
while (pending.size && Date.now() < deadline) {
  for (const o of orders.filter((x) => pending.has(x.id))) {
    const g = await (await fetch(`${BASE}/v2/checkout/orders/${o.id}`, { headers: H })).json();
    if (g.status === 'APPROVED') {
      const c = await fetch(`${BASE}/v2/checkout/orders/${o.id}/capture`, { method: 'POST', headers: { ...H, 'PayPal-Request-Id': `leash-cap-${o.id}`, Prefer: 'return=representation' }, body: '{}' });
      const cj = await c.json(); const cap = cj?.purchase_units?.[0]?.payments?.captures?.[0];
      if (c.ok && cap?.id) { out.push({ txn_id: cap.id, order_id: o.id, captured_cents: toCents(cap.amount.value), currency: cap.amount.currency_code, label: o.label, created: new Date().toISOString() }); console.log(`captured ${cap.id}  ${cap.amount.currency_code} ${cap.amount.value}  ${o.label}`); pending.delete(o.id); }
      else { console.error(`capture failed for ${o.id}: HTTP ${c.status} ${JSON.stringify(cj.details ?? cj.message)}`); pending.delete(o.id); }
    }
  }
  if (pending.size) await sleep(3000);
}
mkdirSync('.seed', { recursive: true }); writeFileSync('.seed/captures.json', JSON.stringify(out, null, 2));
console.log(`\nwrote ${out.length} captures to .seed/captures.json (gitignored)${pending.size ? `; ${pending.size} never approved` : ''}`);
