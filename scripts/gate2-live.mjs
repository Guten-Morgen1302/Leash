// Gate 2: one live sandbox refund through the real gate on a POOL capture (demo captures stay untouched), confirmed by an independent GET.
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { PayPalClient } from '../server/paypal.ts';
import { parseMandate } from '../server/config.ts';
import { runRefund } from '../server/gate.ts';
import { readFileSync, rmSync } from 'node:fs';
const CAP = process.argv[2], ORDER = process.argv[3];
const mandate = parseMandate(JSON.parse(readFileSync('mandate.json', 'utf8')));
const pp = new PayPalClient({ baseUrl: 'https://api-m.sandbox.paypal.com', clientId: process.env.PAYPAL_CLIENT_ID, clientSecret: process.env.PAYPAL_CLIENT_SECRET });
rmSync('.gate2.db', { force: true });
const db = await openDb('.gate2.db'); applySchema(db);
db.run(`INSERT INTO payments(txn_id,captured_cents,currency,source,captured_at) VALUES (?,3500,'USD','gate2',?)`, CAP, Date.now() - 86400000);
db.run(`INSERT INTO orders(order_id,capture_id) VALUES (?,?)`, ORDER, CAP);
db.run(`INSERT INTO order_items(order_id,item_id,name,unit_cents,qty) VALUES (?,'a','Item A',1800,1),(?,'b','Item B',1700,1)`, ORDER, ORDER);
const r = await runRefund({ db, mandate, paypal: pp }, { sessionId: 'gate2', tool: 'refund_items', captureId: CAP, amountCents: null, items: [{ itemId: 'a', qty: 1 }] }, 'Leash gate 2');
console.log('gate:', JSON.stringify(r));
if (r.status === 'executed') { const g = await pp.getRefund(r.refundId); console.log('independent GET:', g.id, g.status, g.amount?.value, g.amount?.currency_code); }
const r2 = await runRefund({ db, mandate, paypal: pp }, { sessionId: 'gate2', tool: 'refund_items', captureId: CAP, amountCents: null, items: [{ itemId: 'b', qty: 1 }] });
console.log('second item (completes the order):', r2.status, r2.ruleId ?? '');
db.close(); rmSync('.gate2.db', { force: true });
