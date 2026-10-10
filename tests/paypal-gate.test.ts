import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PayPalClient, PayPalError, toValue, toCents } from '../server/paypal.ts';
import { parseMandate, MandateError, describeMandate } from '../server/config.ts';
import { runRefund } from '../server/gate.ts';
import { tempDb, seedOrder, fakePayPal, MANDATE_JSON, DAY } from './helpers.ts';

const mandate = parseMandate(MANDATE_JSON);
// PayPalClient insists on a sandbox URL; the injected fetch redirects that fake host to the local fake server.
const client = (f: { url: string }, secret = 'SECRET-xyz') =>
  new PayPalClient({ baseUrl: 'https://api-m.sandbox.paypal.com', clientId: 'id', clientSecret: secret, timeoutMs: 800, fetchImpl: ((u: any, o: any) => fetch(String(u).replace('https://api-m.sandbox.paypal.com', f.url), o)) as typeof fetch });

describe('money and mandate parsing', () => {
  test('cents conversion: exact, no float drift', () => {
    assert.equal(toValue(1800), '18.00'); assert.equal(toValue(5), '0.05'); assert.equal(toValue(10), '0.10');
    for (const [s, c] of [['18.00', 1800], ['0.10', 10], ['0.1', 10], ['5', 500], ['9999999999.99', 999999999999]] as const) assert.equal(toCents(s), c);
    for (const bad of ['1e2', '-5.00', '5.', '.5', ' ', '', 'abc', '1,000.00', '5.001']) assert.equal(toCents(bad), null, `"${bad}" must be rejected`);
  });
  test('mandate: valid parses; null, missing, unknown and inconsistent fields are rejected (no silent defaults)', () => {
    assert.equal(parseMandate(MANDATE_JSON).perActionCapCents, 5000);
    assert.throws(() => parseMandate({ ...MANDATE_JSON, dailyCapCents: null }), /unset.*does not guess/i);
    const { hardMaxCents, ...missing } = MANDATE_JSON as any; assert.throws(() => parseMandate(missing), /hardMaxCents is unset/);
    assert.throws(() => parseMandate({ ...MANDATE_JSON, surprise: 1 }), /Unknown mandate field/);
    assert.throws(() => parseMandate({ ...MANDATE_JSON, perActionCapCents: 12.5 }), /positive integer/);
    assert.throws(() => parseMandate({ ...MANDATE_JSON, hardMaxCents: 100 }), /at least perActionCapCents/);
    assert.throws(() => parseMandate({ ...MANDATE_JSON, schema_version: 2 }), /schema_version 2 is not supported/);
    assert.throws(() => parseMandate({ ...MANDATE_JSON, expiresAt: 'tomorrow' }), MandateError);
  });
  test('/mandate plain-language page mentions every enforced field', () => {
    const text = describeMandate(parseMandate(MANDATE_JSON)).join(' ');
    for (const needle of ['$50.00', '$100.00', '$200.00', '$400.00', '30 days', 'open PayPal dispute', 'every item', '24 hours', '2099-01-01', 'enforced']) assert.ok(text.includes(needle), `missing: ${needle}`);
  });
});

describe('PayPal client', () => {
  test('refuses a non-sandbox URL', () => assert.throws(() => new PayPalClient({ baseUrl: 'https://api-m.paypal.com', clientId: 'a', clientSecret: 'b' }), /non-sandbox/));
  test('refund sends action id as PayPal-Request-Id and exact decimal amount', async () => {
    const f = await fakePayPal('TOK1'); const pp = client(f);
    const r = await pp.refund('CAP1', 1805, 'USD', 'act_1', 'note');
    assert.match(r.id, /^REFUND/);
    const c = f.calls.find((x) => x.url.endsWith('/refund'))!;
    assert.equal(c.rid, 'act_1'); assert.equal(c.auth, 'Bearer TOK1');
    assert.deepEqual(JSON.parse(c.body).amount, { currency_code: 'USD', value: '18.05' });
    await f.close();
  });
  test('errors never contain secrets', async () => {
    const f = await fakePayPal('TOK2'); const pp = client(f, 'SECRET-xyz');
    await pp.getCapture('C1'); // token cached
    f.setMode('422');
    await assert.rejects(pp.refund('C1', 100, 'USD', 'a2'), (e: any) => e instanceof PayPalError && e.status === 422 && !e.message.includes('TOK2') && !pp.scrub('x TOK2 SECRET-xyz').includes('TOK2') && !pp.scrub('SECRET-xyz').includes('SECRET'));
    await f.close();
  });
  test('a 401 triggers exactly one token refresh and one retry', async () => {
    const f = await fakePayPal('TOK3'); const pp = client(f);
    await pp.getCapture('C1'); f.setMode('expire-once');
    await pp.getCapture('C1');
    assert.equal(f.calls.filter((c) => c.url === '/v1/oauth2/token').length, 2);
    await f.close();
  });
  test('readState: capture time and dispute flag; lookup failure gives null (never a guess)', async () => {
    const f = await fakePayPal(); const pp = client(f);
    f.setDisputes([{ dispute_state: 'UNDER_REVIEW' }]);
    const s = await pp.readState('C1');
    assert.equal(s.disputeOpen, true); assert.ok(Math.abs(s.capturedAtMs! - (Date.now() - 2 * DAY)) < 60_000);
    f.setDisputes([{ dispute_state: 'RESOLVED' }]); assert.equal((await pp.readState('C1')).disputeOpen, false);
    await f.close();
    const dead = await client({ url: 'http://127.0.0.1:1' }).readState('C1');
    assert.deepEqual(dead, { capturedAtMs: null, disputeOpen: null });
  });
});

describe('gate end to end (fake PayPal)', () => {
  const setup = async () => { const f = await fakePayPal(); const { db } = await tempDb(); seedOrder(db, 'CAP1'); return { f, db, d: { db, mandate, paypal: client(f) } }; };
  const item = (itemId: string) => ({ sessionId: 's1', tool: 'refund_items' as const, captureId: 'CAP1', amountCents: null, items: [{ itemId, qty: 1 }] });

  test('legit $18 item refund executes at PayPal for exactly 18.00', async () => {
    const { f, d } = await setup();
    const r = await runRefund(d, item('mug'));
    assert.equal(r.status, 'executed'); assert.equal((r as any).amountCents, 1800);
    assert.equal(JSON.parse(f.calls.find((c) => c.url.endsWith('/refund'))!.body).amount.value, '18.00');
    await f.close();
  });
  test('full-order attack never reaches PayPal', async () => {
    const { f, d } = await setup();
    const out: string[] = [];
    for (const id of ['mug', 'cushion', 'lamp', 'towels', 'vase']) out.push((await runRefund(d, item(id))).status);
    const refunds = f.calls.filter((c) => c.url.endsWith('/refund')).length;
    assert.ok(refunds < 5, `all five items reached PayPal: ${out}`);
    assert.ok(out.includes('pending_approval') || out.includes('blocked'));
    await f.close();
  });
  test('open dispute blocks before any refund call', async () => {
    const { f, d } = await setup(); f.setDisputes([{ dispute_state: 'OPEN' }]);
    const r = await runRefund(d, item('mug')); assert.equal(r.status, 'blocked');
    assert.equal(f.calls.filter((c) => c.url.endsWith('/refund')).length, 0);
    await f.close();
  });
  test('4xx from PayPal releases the reservation; 5xx keeps it', async () => {
    const { f, d, db } = await setup();
    f.setMode('422'); assert.equal((await runRefund(d, item('mug'))).status, 'execution_failed');
    f.setMode('ok'); assert.equal((await runRefund(d, item('mug'))).status, 'executed'); // released, so mug is refundable again
    f.setMode('500'); assert.equal((await runRefund(d, item('cushion'))).status, 'unknown_outcome');
    const st = db.val<string>(`SELECT status FROM actions ORDER BY created_at DESC LIMIT 1`);
    assert.equal(st, 'unknown_outcome');
    await f.close();
  });
  test('simulated mode (no credentials) runs the real pipeline with a SIM refund id', async () => {
    const { db } = await tempDb(); seedOrder(db, 'CAP1');
    const r = await runRefund({ db, mandate, paypal: null }, item('mug'));
    assert.equal(r.status, 'executed'); assert.match((r as any).refundId, /^SIM-/); assert.equal((r as any).mode, 'sim');
  });
});
