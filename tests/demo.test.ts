import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { parseMandate } from '../server/config.ts';
import { tempDb, MANDATE_JSON } from './helpers.ts';

test('demo lanes: allow / block / escalate+approve+retry; exposure meter equals the policy window sum', async () => {
  const { db } = await tempDb();
  const s: any = createApp({ db, mandate: parseMandate(MANDATE_JSON), paypal: null }).listen(0, '127.0.0.1');
  await new Promise((r) => s.once('listening', r));
  const base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  const post = async (p: string, b: unknown) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json() as Promise<any>;

  const t1 = await post('/v1/demo/run', { ticketId: 1 });
  assert.equal(t1.guarded.status, 'executed'); assert.equal(t1.guarded.amount, '18.00'); assert.equal(t1.exposure.spentCents, 1800);

  const t2 = await post('/v1/demo/run', { ticketId: 2 });
  assert.equal(t2.unguarded.amount, '200.00'); assert.equal(t2.unguarded.exposure, 'unlimited');
  assert.equal(t2.guarded.status, 'blocked'); assert.equal(t2.guarded.ruleId, 'R-HARD-MAX'); assert.equal(t2.exposure.spentCents, 0);

  const t3 = await post('/v1/demo/run', { ticketId: 3 });
  assert.equal(t3.guarded.status, 'pending_approval');
  const { actionId, approvalUrl } = t3.guarded; const token = approvalUrl.split('#t=')[1];
  const info = await (await fetch(`${base}/v1/approval/${actionId}`)).json() as any;
  assert.equal(info.amountCents, 7500); assert.match(info.summary, /Advisory/); assert.ok(!JSON.stringify(info).includes(token));
  assert.equal((await post('/v1/approve', { actionId, token: 'bad', decision: 'approve' }) as any).ok, false);
  assert.equal((await post('/v1/approve', { actionId, token, decision: 'approve' })).ok, true);
  const retry = await post('/v1/demo/retry', { actionId });
  assert.equal(retry.guarded.status, 'executed'); assert.equal(retry.exposure.spentCents, 7500);
  assert.equal((await post('/v1/demo/retry', { actionId: 'nope' }) as any).error, 'unknown_run');

  // meter == policy window sum
  const sum = db.val<number>(`SELECT COALESCE(SUM(amount_cents),0) FROM actions WHERE session_id=? AND status IN ('reserved','executed','approved_executed','unknown_outcome')`, t3.exposure.sessionId);
  assert.equal(sum, retry.exposure.spentCents);
  s.closeAllConnections(); s.close();
});
