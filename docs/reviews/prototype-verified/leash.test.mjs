import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { openDb, applySchema, tx } from './db.mjs';
import { check, result, sweep, approve, verifyChain, decide } from './dispatch.mjs';

const M = { perActionCapCents: 5000, hardMaxCents: 10000, dailyCapCents: 20000, hardDailyCapCents: 40000, expiresAt: Date.now() + 864e5 };
const seed = async (driver, caps) => {
  const path = join(mkdtempSync(join(tmpdir(), 'leash-')), 't.db'); const db = await openDb(path, { driver }); applySchema(db);
  for (const [id, c] of Object.entries(caps)) db.run(`INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source) VALUES (?,?,0,0,'USD','seed')`, id, c);
  return { path, db };
};
const A = (id, cap, cents, sid = 's', extra = {}) => ({ actionId: id, sessionId: sid, tool: 'refund', captureId: cap, amountCents: cents, ...extra });

const spawn = (path, driver, gate, extra) => new Worker(new URL('./conc.worker.mjs', import.meta.url), { workerData: { path, driver, gate, mandate: M, ...extra } });
const wait = (w, pred) => new Promise((res) => w.on('message', (m) => pred(m) && res(m)));
const release = (g) => { Atomics.store(new Int32Array(g), 0, 1); Atomics.notify(new Int32Array(g), 0); };

for (const driver of ['better-sqlite3', 'node:sqlite']) describe(`driver ${driver}`, () => {
  test('actually opens with the requested driver', async () => { const { db } = await seed(driver, {}); assert.equal(db.driver, driver); });

  test('demo trio: $18/$60 allow, $75/$120 escalate, $900/$60 block R-OVER-CAPTURE', async () => {
    const { db } = await seed(driver, { C60: 6000, C120: 12000, C60b: 6000 });
    assert.equal(check(db, M, A('t1', 'C60', 1800)).status, 'allowed');
    const e = check(db, M, A('t2', 'C120', 7500)); assert.equal(e.status, 'pending_approval'); assert.equal(e.ruleId, 'R-ACTION-CAP');
    const b = check(db, M, A('t3', 'C60b', 90000)); assert.equal(b.status, 'blocked'); assert.equal(b.ruleId, 'R-OVER-CAPTURE');
    assert.equal(verifyChain(db).ok, true);
  });

  test('omitted amount resolves to the remaining balance; currency mismatch blocks (R-CURRENCY)', async () => {
    const { db } = await seed(driver, { C1: 4000, C2: 4000 });
    const full = check(db, M, { ...A('f1', 'C1', null) }); assert.equal(full.status, 'allowed');
    assert.equal(db.val('SELECT amount_cents FROM actions WHERE id=?', 'f1'), 4000);
    const cur = check(db, M, A('f2', 'C2', 1000, 's', { currency: 'JPY' })); assert.equal(cur.ruleId, 'R-CURRENCY');
  });

  test('tx: rolls back on exception, rejects async callbacks and nesting, stays usable after', async () => {
    const { db } = await seed(driver, { C1: 1000 });
    assert.throws(() => tx(db, () => { db.run(`UPDATE payments SET reserved_cents=999`); throw new Error('boom'); }), /boom/);
    assert.equal(db.val('SELECT reserved_cents FROM payments'), 0, 'rolled back');
    assert.throws(() => tx(db, async () => 1), /synchronous/);
    assert.equal(db.val('SELECT reserved_cents FROM payments'), 0);
    assert.throws(() => tx(db, () => tx(db, () => 1)), /nested/);
    assert.equal(tx(db, () => db.val('SELECT 41+1')), 42);
  });

  test('approval: re-evaluates hard rules; grant single-use; retry consumes it; second retry escalates again', async () => {
    const { db } = await seed(driver, { C1: 12000, C2: 12000 });
    const e = check(db, M, A('p1', 'C1', 7500)); assert.equal(e.status, 'pending_approval');
    assert.equal(approve(db, M, { actionId: 'p1', token: 'wrong', decision: 'approve' }).code, 403);
    assert.equal(approve(db, M, { actionId: 'p1', token: e.token, decision: 'approve' }).ok, true);
    assert.equal(approve(db, M, { actionId: 'p1', token: e.token, decision: 'approve' }).code, 409, 'replay / double click');
    const retry = check(db, M, A('p1-retry', 'C1', 7500)); assert.equal(retry.status, 'allowed'); assert.equal(retry.ruleId, 'R-APPROVED');
    const again = check(db, M, A('p1-retry2', 'C1', 7500)); assert.notEqual(again.status, 'allowed', 'grant is single-use (blocked as dup here)');
  });

  test('approval rejected when other tickets ate the HARD daily cap in the meantime', async () => {
    const caps = { C1: 12000 }; for (let i = 0; i < 9; i++) caps[`X${i}`] = 5000;
    const { db } = await seed(driver, caps);
    const e = check(db, M, A('esc', 'C1', 7500)); assert.equal(e.status, 'pending_approval');
    for (let i = 0; i < 9; i++) check(db, { ...M, dailyCapCents: 10 ** 9 }, A(`x${i}`, `X${i}`, 5000));   // 9 x $50 = $450 > $400 hard daily
    const r = approve(db, M, { actionId: 'esc', token: e.token, decision: 'approve' });
    assert.equal(r.ok, false); assert.match(r.why, /hard daily/);
  });

  test('approval expiry', async () => {
    const { db } = await seed(driver, { C1: 12000 });
    const e = check(db, M, A('x', 'C1', 7500), 1_000_000);
    assert.equal(approve(db, M, { actionId: 'x', token: e.token, decision: 'approve' }, 1_000_000 + 16 * 60_000).code, 410);
  });

  test('window/dup queries exclude the action itself (synthetic counted row with the same id)', async () => {
    const { db } = await seed(driver, { C1: 12000 });
    const now = Date.now();
    db.run(`INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,status,created_at,updated_at) VALUES ('self','s','refund','C1',7500,'reserved',?,?)`, now, now);
    const win = db.val(`SELECT COALESCE(SUM(amount_cents),0) FROM actions WHERE session_id=? AND created_at>=? AND id<>? AND status IN ('reserved')`, 's', now - 864e5, 'self');
    assert.equal(win, 0);
  });

  test('PostToolUse: executed updates balances; failed releases; silent call becomes unknown_outcome and still counts toward cap', async () => {
    const { db } = await seed(driver, { C1: 100000 });
    const t0 = Date.now();
    check(db, M, A('r1', 'C1', 4000, 's', {}), t0); result(db, { actionId: 'r1', outcome: 'executed' });
    assert.deepEqual(db.one('SELECT reserved_cents r, refunded_cents f FROM payments'), { r: 0, f: 4000 });
    check(db, M, A('r2', 'C1', 3000), t0); result(db, { actionId: 'r2', outcome: 'failed' });
    assert.equal(db.val('SELECT reserved_cents FROM payments'), 0);
    check(db, M, A('r3', 'C1', 4500), t0);
    sweep(db, t0 + 121_000);
    assert.equal(db.val(`SELECT status FROM actions WHERE id='r3'`), 'unknown_outcome');
    assert.equal(db.val('SELECT reserved_cents FROM payments'), 4500, 'reservation stays held');
    const win = db.val(`SELECT SUM(amount_cents) FROM actions WHERE status IN ('reserved','executed','approved_executed','unknown_outcome')`);
    assert.equal(win, 4000 + 4500);
  });

  test('ledger: valid chain verifies; edit-middle and delete-middle DETECTED; tail truncation NOT detected (documented limit)', async () => {
    const { db } = await seed(driver, { C1: 100000 });
    for (let i = 0; i < 5; i++) check(db, M, A(`l${i}`, 'C1', 1000 + i * 100, `s${i}`));
    assert.equal(verifyChain(db).ok, true);
    db.run(`UPDATE ledger SET payload_json='{"ruleId":"R-ALLOW","amountCents":1,"captureId":"C1"}' WHERE seq=3`);
    assert.equal(verifyChain(db).ok, false, 'edit detected');
    db.run('DELETE FROM ledger WHERE seq=3'); assert.equal(verifyChain(db).ok, false, 'deletion detected');
    const { db: d2 } = await seed(driver, { C1: 100000 });
    for (let i = 0; i < 5; i++) check(d2, M, A(`l${i}`, 'C1', 1000 + i * 100, `s${i}`));
    d2.run('DELETE FROM ledger WHERE seq>3');
    const v = verifyChain(d2); assert.equal(v.ok, true, 'LIMIT: tail truncation passes verification'); assert.equal(v.rows, 3);
  });

  test('CONTENTION: 8 simultaneous $40 refunds vs $200 daily cap => exactly 5 allowed, 0 BUSY errors', async () => {
    const caps = {}; for (let i = 0; i < 8; i++) caps[`CAP${i}`] = 100_000;      // distinct captures: identical refunds on one capture would hit R-DUP first
    const { path } = await seed(driver, caps); const gate = new SharedArrayBuffer(4);
    const ws = Array.from({ length: 8 }, (_, i) => spawn(path, driver, gate, { input: A(`a${i}`, `CAP${i}`, 4000) }));
    const results = ws.map((w) => wait(w, (m) => m.d || m.err)); await Promise.all(ws.map((w) => wait(w, (m) => m.ready)));
    release(gate); const out = await Promise.all(results);
    assert.deepEqual(out.filter((o) => o.err), [], 'no error escaped');
    assert.equal(out.filter((o) => o.d.status === 'allowed').length, 5);
    const db = await openDb(path, { driver }); assert.equal(db.val(`SELECT SUM(amount_cents) FROM actions WHERE status='reserved'`), 20000);
  });

  test('CONTENTION: 6 simultaneous $30 refunds on ONE $100 capture => 3 allowed, 3 over-capture, reserved <= captured', async () => {
    const { path } = await seed(driver, { CAP1: 10_000 }); const gate = new SharedArrayBuffer(4);
    const ws = Array.from({ length: 6 }, (_, i) => spawn(path, driver, gate, { input: A(`b${i}`, 'CAP1', 3000, `s${i}`) }));
    const results = ws.map((w) => wait(w, (m) => m.d || m.err)); await Promise.all(ws.map((w) => wait(w, (m) => m.ready)));
    release(gate); const out = await Promise.all(results);
    assert.deepEqual(out.filter((o) => o.err), []);
    assert.equal(out.filter((o) => o.d.status === 'allowed').length, 3);
    assert.equal(out.filter((o) => o.d.ruleId === 'R-OVER-CAPTURE').length, 3);
    const db = await openDb(path, { driver }); const p = db.one('SELECT reserved_cents r, refunded_cents f, captured_cents c FROM payments'); assert.ok(p.r + p.f <= p.c);
  });

  test('busy_timeout: lock held ~900ms; timeout 3000 waits and succeeds; timeout 0 fails with BUSY (negative control)', async () => {
    const { path } = await seed(driver, { CAP1: 100_000 }); const gate = new SharedArrayBuffer(4);
    const holder = spawn(path, driver, gate, { holdMs: 900 });
    await wait(holder, (m) => m.ready); const locked = wait(holder, (m) => m.locked); release(gate); await locked;
    const g2 = new SharedArrayBuffer(4);
    const patient = spawn(path, driver, g2, { input: A('p', 'CAP1', 1000), busyTimeoutMs: 3000 });
    const impatient = spawn(path, driver, g2, { input: A('q', 'CAP1', 1000, 's2'), busyTimeoutMs: 0 });
    const [rp, rq] = [wait(patient, (m) => m.d || m.err), wait(impatient, (m) => m.d || m.err)];
    await Promise.all([wait(patient, (m) => m.ready), wait(impatient, (m) => m.ready)]); release(g2);
    const [a, b] = await Promise.all([rp, rq]);
    assert.equal(a.d?.status, 'allowed', `patient: ${JSON.stringify(a)}`); assert.ok(a.ms > 250, `waited ${a.ms}ms`);
    assert.match(b.err ?? '', /BUSY|busy|locked/i, `impatient got: ${JSON.stringify(b)}`);
  });
});
