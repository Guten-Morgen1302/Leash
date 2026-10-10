import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { check, sweep, approve } from '../server/dispatch.ts';
import { parseMandate } from '../server/config.ts';
import { aiSummary } from '../server/llm.ts';
import { rateLimit } from '../server/ratelimit.ts';
import { tempDb, seedOrder, MANDATE_JSON } from './helpers.ts';

const m = parseMandate(MANDATE_JSON);
const ext = { disputeOpen: false, capturedAtMs: null };

test('restart mid-flow: reservations still count against the cap, pending approvals stay valid', async () => {
  const { db, path } = await tempDb(); seedOrder(db, 'C1'); seedOrder(db, 'C2');
  const a = check(db, m, { actionId: 'a1', sessionId: 's', tool: 'refund_items', captureId: 'C1', amountCents: null, items: [{ itemId: 'lamp', qty: 1 }, { itemId: 'vase', qty: 1 }] }, Date.now(), ext); // $105 > hardMax -> blocked
  const b = check(db, m, { actionId: 'a2', sessionId: 's', tool: 'refund_items', captureId: 'C1', amountCents: null, items: [{ itemId: 'lamp', qty: 1 }] }, Date.now(), ext); // $55 > $50 cap -> pending
  const c = check(db, m, { actionId: 'a3', sessionId: 's', tool: 'refund_items', captureId: 'C2', amountCents: null, items: [{ itemId: 'mug', qty: 1 }] }, Date.now(), ext); // $18 reserved, never finished (crash)
  assert.equal(a.status, 'blocked'); assert.equal(b.status, 'pending_approval'); assert.equal(c.status, 'allowed');
  const token = b.token!;
  db.close(); // "kill the server"
  const db2 = await openDb(path); applySchema(db2);
  const spent = db2.val<number>(`SELECT COALESCE(SUM(amount_cents),0) FROM actions WHERE session_id='s' AND status IN ('reserved','executed','approved_executed','unknown_outcome')`);
  assert.equal(spent, 1800, 'the in-flight reservation survives the restart (no under-count)');
  assert.equal(approve(db2, m, { actionId: 'a2', token, decision: 'approve' }, Date.now(), ext).ok, true, 'pending approval still works');
  sweep(db2, Date.now() + 121_000);
  assert.equal(db2.val<string>(`SELECT status FROM actions WHERE id='a3'`), 'unknown_outcome', 'crashed reservation becomes unknown_outcome and keeps counting');
  const expired = approve(db2, m, { actionId: 'a2', token, decision: 'approve' }, Date.now() + 3_600_000, ext);
  assert.equal(expired.ok, false);
});

test('AI summary: keyless returns null; failure and timeout return null (never throws, never blocks)', async () => {
  const old = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  assert.equal(await aiSummary({ amountCents: 7500, ruleId: 'R-ACTION-CAP', ticket: 'x' }), null);
  process.env.GEMINI_API_KEY = 'k'; process.env.GEMINI_MODEL = 'some-model';
  assert.equal(await aiSummary({ amountCents: 7500, ruleId: 'R-ACTION-CAP', ticket: 'x' }, (async () => { throw new Error('down'); }) as any), null);
  assert.equal(await aiSummary({ amountCents: 7500, ruleId: 'R-ACTION-CAP', ticket: 'x' }, (async () => new Response('{}', { status: 500 })) as any), null);
  const ok = await aiSummary({ amountCents: 7500, ruleId: 'R-ACTION-CAP', ticket: 'x' }, (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Customer wants $75 back.' }] } }] }))) as any);
  assert.equal(ok, 'Customer wants $75 back.');
  let sent: any;
  await aiSummary({ amountCents: 1, ruleId: 'R', ticket: 'x' }, (async (_u: any, o: any) => { sent = JSON.parse(o.body); return new Response('{}'); }) as any);
  assert.ok(sent.generationConfig.maxOutputTokens >= 1024, 'thinking tokens share this budget; a small cap truncates answers (seen with gemini-3.8-flash)');
  assert.equal(sent.generationConfig.thinkingConfig.thinkingLevel, 'low');
  delete process.env.GEMINI_MODEL; if (old) process.env.GEMINI_API_KEY = old; else delete process.env.GEMINI_API_KEY;
});

test('rate limiter: allows up to max per window per IP, then 429 with Retry-After; window resets', () => {
  let t = 0; const rl = rateLimit(3, 1000, () => t);
  const run = (ip: string) => { let code = 200; let retry = ''; rl({ ip } as any, { status: (c: number) => { code = c; return { set: (_: string, v: string) => { retry = v; return { json: () => 0 }; } }; } } as any, () => {}); return { code, retry }; };
  assert.deepEqual([1, 2, 3].map(() => run('a').code), [200, 200, 200]);
  assert.equal(run('a').code, 429); assert.ok(Number(run('a').retry) >= 1);
  assert.equal(run('b').code, 200, 'another IP is unaffected');
  t = 1001; assert.equal(run('a').code, 200);
});

test('port in use is detectable (index.ts retries the next port)', async () => {
  const s = createServer().listen(0, '127.0.0.1'); await new Promise((r) => s.once('listening', r));
  const port = (s.address() as any).port;
  const code = await new Promise((r) => createServer().once('error', (e: any) => r(e.code)).listen(port, '127.0.0.1'));
  assert.equal(code, 'EADDRINUSE'); s.close();
});
