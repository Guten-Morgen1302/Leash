import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { check, result, approve, preventedLoss } from '../server/dispatch.ts';
import { verifyChain } from '../server/ledger.ts';

const DAY = 86_400_000;
const base: any = { perActionCapCents: 5000, hardMaxCents: 10000, dailyCapCents: 20000, hardDailyCapCents: 40000, dupWindowMs: DAY, expiresAt: Date.now() + 30 * DAY };
const big: any = { ...base, perActionCapCents: 10_000_000, hardMaxCents: 10_000_000, dailyCapCents: 10_000_000, hardDailyCapCents: 10_000_000 };
const A = (id: string, cap: string, cents: number | null, extra: any = {}) => ({ actionId: id, sessionId: 's', tool: 'refund', captureId: cap, amountCents: cents, ...extra });
const I = (id: string, cap: string, items: { itemId: string; qty: number }[], extra: any = {}) => ({ actionId: id, sessionId: 's', tool: 'refund_items', captureId: cap, amountCents: 99999999, items, ...extra }); // the agent-supplied amount must be IGNORED

const seedOrder = (db: any, cap = 'C', capturedAt: number | null = null) => {
  db.run(`INSERT INTO payments(txn_id,captured_cents,currency,source,captured_at) VALUES (?,?,?,?,?)`, cap, 20000, 'USD', 'test', capturedAt);
  db.run(`INSERT INTO orders(order_id,capture_id) VALUES (?,?)`, 'ORD-' + cap, cap);
  const items: [string, string, number, number, number, string | null][] = [
    ['mug', 'Ceramic mug', 1800, 1, 1, null], ['cushion', 'Cushion', 4200, 1, 1, null], ['lamp', 'Desk lamp', 5500, 1, 1, null],
    ['towels', 'Towel set', 3500, 1, 1, null], ['vase', 'Vase', 5000, 1, 1, null],
  ];
  for (const [id, name, cents, qty, refundable, flag] of items) db.run(`INSERT INTO order_items(order_id,item_id,name,unit_cents,qty,refundable,flag) VALUES (?,?,?,?,?,?,?)`, 'ORD-' + cap, id, name, cents, qty, refundable, flag);
};
const mk = async (driver: any) => {
  const db = await openDb(join(mkdtempSync(join(tmpdir(), 'sis-')), 't.db'), { driver });
  applySchema(db);
  return db;
};

for (const driver of ['better-sqlite3', 'node:sqlite'] as const)
  describe(`state, items and shadow on ${driver}`, () => {
    test('R-DISPUTE-OPEN blocks, even after human approval (a hard rule)', async () => {
      const db = await mk(driver);
      db.run(`INSERT INTO payments(txn_id,captured_cents,currency,source) VALUES ('C',12000,'USD','t')`);
      const m = { ...base, blockIfOpenDispute: true };
      const ok = check(db, m, A('a1', 'C', 7500), Date.now(), { disputeOpen: false, capturedAtMs: null });
      assert.equal(ok.status, 'pending_approval'); assert.equal(ok.ruleId, 'R-ACTION-CAP');
      const stateAtApprove = { disputeOpen: true, capturedAtMs: null };
      const r = approve(db, m, { actionId: 'a1', token: ok.token!, decision: 'approve' }, Date.now(), stateAtApprove);
      assert.equal(r.ok, false); assert.match((r as any).why, /dispute/i);
      const direct = check(db, m, A('a2', 'C', 1000), Date.now(), { disputeOpen: true, capturedAtMs: null });
      assert.equal(direct.ruleId, 'R-DISPUTE-OPEN'); assert.equal(direct.status, 'blocked');
    });
    test('dispute lookup failure (null) escalates R-STATE-UNAVAILABLE, never allows; the mandate without the flag is unaffected', async () => {
      const db = await mk(driver);
      db.run(`INSERT INTO payments(txn_id,captured_cents,currency,source) VALUES ('C',12000,'USD','t'),('D',12000,'USD','t')`);
      const e = check(db, { ...base, blockIfOpenDispute: true }, A('s1', 'C', 1000), Date.now(), { disputeOpen: null, capturedAtMs: null });
      assert.equal(e.status, 'pending_approval'); assert.equal(e.ruleId, 'R-STATE-UNAVAILABLE');
      const noFlag = check(db, base, A('s2', 'D', 1000), Date.now(), { disputeOpen: null, capturedAtMs: null });
      assert.equal(noFlag.status, 'allowed');
    });
    test('R-WINDOW: refund outside the return window is blocked; inside is allowed; window set but date unknown escalates', async () => {
      const db = await mk(driver);
      const now = Date.now();
      db.run(`INSERT INTO payments(txn_id,captured_cents,currency,source,captured_at) VALUES ('OLD',12000,'USD','t',?),('NEW',12000,'USD','t',?),('NODATE',12000,'USD','t',NULL)`, now - 40 * DAY, now - 5 * DAY);
      const m = { ...base, returnWindowDays: 30 };
      const old = check(db, m, A('w1', 'OLD', 1000), now); assert.equal(old.ruleId, 'R-WINDOW'); assert.equal(old.status, 'blocked');
      assert.equal(check(db, m, A('w2', 'NEW', 1000), now).status, 'allowed');
      const nd = check(db, m, A('w3', 'NODATE', 1000), now); assert.equal(nd.ruleId, 'R-STATE-UNAVAILABLE');
      const viaExt = check(db, m, A('w4', 'NODATE', 1100), now, { disputeOpen: false, capturedAtMs: now - 3 * DAY }); assert.equal(viaExt.status, 'allowed');
    });
    test('ITEMS: amount is computed from order data and the agent-supplied amount is ignored', async () => {
      const db = await mk(driver); seedOrder(db);
      const r = check(db, big, I('i1', 'C', [{ itemId: 'mug', qty: 1 }]));
      assert.equal(r.status, 'allowed');
      assert.equal(db.val('SELECT amount_cents FROM actions WHERE id=?', 'i1'), 1800, 'computed from the mug price, not the 99999999 the agent sent');
      assert.equal(db.val('SELECT reserved_qty FROM order_items WHERE item_id=?', 'mug'), 1);
      result(db, { actionId: 'i1', outcome: 'executed', refundId: 'R1' });
      assert.deepEqual(db.one('SELECT reserved_qty r, refunded_qty f FROM order_items WHERE item_id=?', 'mug'), { r: 0, f: 1 });
      assert.equal(db.val('SELECT refunded_cents FROM payments WHERE txn_id=?', 'C'), 1800);
    });
    test('ITEMS: unknown item, non-refundable item, already-refunded item, unknown capture', async () => {
      const db = await mk(driver); seedOrder(db);
      db.run(`UPDATE order_items SET refundable=0, flag='final_sale' WHERE item_id='vase'`);
      assert.equal(check(db, big, I('u1', 'C', [{ itemId: 'ghost', qty: 1 }])).ruleId, 'R-ITEMS-UNKNOWN');
      const nr = check(db, big, I('u2', 'C', [{ itemId: 'vase', qty: 1 }])); assert.equal(nr.ruleId, 'R-ITEM-NONREFUNDABLE'); assert.match(nr.reason, /final_sale/);
      assert.equal(check(db, big, I('u3', 'C', [{ itemId: 'mug', qty: 1 }])).status, 'allowed');
      assert.equal(check(db, big, I('u4', 'C', [{ itemId: 'mug', qty: 1 }])).ruleId, 'R-ITEMS-REFUNDED', 'reserved quantity counts immediately');
      assert.equal(check(db, big, I('u5', 'NOPE', [{ itemId: 'mug', qty: 1 }])).ruleId, 'R-ITEMS-UNKNOWN');
      assert.equal(check(db, big, I('u6', 'C', [{ itemId: 'lamp', qty: 0 }])).ruleId, 'R-ITEMS-UNKNOWN', 'zero or negative quantity is rejected');
    });
    test('ITEMS: a failed execution releases the reserved quantity so the item can be refunded again', async () => {
      const db = await mk(driver); seedOrder(db);
      check(db, big, I('f1', 'C', [{ itemId: 'mug', qty: 1 }]));
      result(db, { actionId: 'f1', outcome: 'failed' });
      assert.equal(db.val('SELECT reserved_qty FROM order_items WHERE item_id=?', 'mug'), 0);
      assert.equal(check(db, big, I('f2', 'C', [{ itemId: 'mug', qty: 1 }])).status, 'allowed');
    });
    test('ITEMS: naming every item escalates (R-ITEMS-ALL), and splitting the whole order across calls cannot dodge it', async () => {
      const db = await mk(driver); seedOrder(db);
      const all = ['mug', 'cushion', 'lamp', 'towels', 'vase'].map((itemId) => ({ itemId, qty: 1 }));
      const one = check(db, big, I('all1', 'C', all)); assert.equal(one.status, 'pending_approval'); assert.equal(one.ruleId, 'R-ITEMS-ALL');
      const db2 = await mk(driver); seedOrder(db2);
      assert.equal(check(db2, big, I('p1', 'C', [{ itemId: 'mug', qty: 1 }, { itemId: 'cushion', qty: 1 }])).status, 'allowed');
      const last = check(db2, big, I('p2', 'C', [{ itemId: 'lamp', qty: 1 }, { itemId: 'towels', qty: 1 }, { itemId: 'vase', qty: 1 }]));
      assert.equal(last.ruleId, 'R-ITEMS-ALL', 'the call that completes the order escalates');
      const db3 = await mk(driver); seedOrder(db3);
      assert.equal(check(db3, { ...big, escalateFullOrder: false }, I('x1', 'C', all)).status, 'allowed', 'the merchant can turn the rule off');
    });
    test('ITEMS: approval then retry executes the same items once (grant bound to the item list)', async () => {
      const db = await mk(driver); seedOrder(db);
      const all = ['mug', 'cushion', 'lamp', 'towels', 'vase'].map((itemId) => ({ itemId, qty: 1 }));
      const m = { ...big, hardMaxCents: 10_000_000 };
      const e = check(db, m, I('g1', 'C', all)); assert.equal(e.ruleId, 'R-ITEMS-ALL');
      assert.equal(approve(db, m, { actionId: 'g1', token: e.token!, decision: 'approve' }).ok, true);
      const other = check(db, m, I('g2', 'C', [{ itemId: 'mug', qty: 1 }])); assert.equal(other.status, 'allowed', 'a different item list does not consume the full-order grant');
      const retry = check(db, m, I('g3', 'C', all.filter((x) => x.itemId !== 'mug'))); assert.notEqual(retry.ruleId, 'R-APPROVED', 'a subset must not use the grant');
    });
    test('SHADOW: records would-have decisions, never reserves, never blocks, and the report adds up', async () => {
      const db = await mk(driver);
      db.run(`INSERT INTO payments(txn_id,captured_cents,currency,source) VALUES ('C',20000,'USD','t')`);
      const m = { ...base, shadow: true };
      const a = check(db, m, A('sh1', 'C', 18000)); // would be blocked by hard max
      assert.equal(a.status, 'allowed'); assert.equal(a.shadow, true); assert.equal(a.wouldHave?.status, 'blocked'); assert.equal(a.wouldHave?.ruleId, 'R-HARD-MAX');
      const b = check(db, m, A('sh2', 'C', 7500)); assert.equal(b.wouldHave?.status, 'pending_approval');
      const c = check(db, m, A('sh3', 'C', 1500)); assert.equal(c.wouldHave?.status, 'allowed');
      assert.equal(db.val('SELECT reserved_cents FROM payments WHERE txn_id=?', 'C'), 0, 'shadow reserves nothing');
      assert.equal(db.val(`SELECT COUNT(*) FROM approvals`), 0, 'shadow creates no approvals');
      const rep = preventedLoss(db);
      assert.deepEqual({ block: rep.wouldBlockCents, esc: rep.wouldEscalateCents, n: rep.actions }, { block: 18000, esc: 7500, n: 3 });
      assert.equal(verifyChain(db).ok, true);
    });
  });
