// Loads the already-created sandbox captures (.seed/captures.json) into the Leash DB. Makes NO PayPal calls and never re-seeds PayPal.
// The $200 demo order gets its five line items; other captures have no item data (item-scoped refunds on them are escalated).
import { readFileSync } from 'node:fs';
const path = process.env.LEASH_DB ?? 'leash.db';
const caps = JSON.parse(readFileSync('.seed/captures.json', 'utf8'));
const { applySchema } = await import('../server/schema.ts');
const { openDb } = await import('../server/db.ts');
const d = await openDb(path);
applySchema(d);
const ITEMS = [['mug', 'Ceramic mug', 1800], ['cushion', 'Velvet cushion', 4200], ['lamp', 'Desk lamp', 5500], ['towels', 'Towel set', 3500], ['vase', 'Stoneware vase', 5000]];
for (const c of caps) {
  d.run(`INSERT OR IGNORE INTO payments(txn_id,captured_cents,currency,source,captured_at) VALUES (?,?,?,?,?)`, c.txn_id, c.captured_cents, c.currency, 'sandbox:' + c.label, Date.parse(c.created));
  d.run(`INSERT OR IGNORE INTO orders(order_id,capture_id) VALUES (?,?)`, c.order_id, c.txn_id);
  if (c.captured_cents === 20000) for (const [id, name, cents] of ITEMS) d.run(`INSERT OR IGNORE INTO order_items(order_id,item_id,name,unit_cents,qty) VALUES (?,?,?,?,1)`, c.order_id, id, name, cents);
}
console.log(`Seeded ${caps.length} captures into ${path}.`);
d.close();
