import { test } from 'node:test'; import assert from 'node:assert/strict';
import { spawn } from 'node:child_process'; import http from 'node:http';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { openDb, applySchema } from './db.mjs'; import { check } from './dispatch.mjs';

const M = { perActionCapCents: 5000, hardMaxCents: 10000, dailyCapCents: 20000, hardDailyCapCents: 40000, expiresAt: Date.now() + 864e5 };
const ev = (tool, input, id = 'toolu_1') => JSON.stringify({ session_id: 'sess', hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: id });
const run = (stdin, env = {}) => new Promise((res) => {
  const p = spawn(process.execPath, ['hook.mjs'], { env: { ...process.env, ...env }, cwd: import.meta.dirname }); let out = '', err = '';
  p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d)); const t0 = Date.now();
  p.on('close', (code) => res({ code, out, err, ms: Date.now() - t0 })); p.stdin.end(stdin);
});
const NAME = 'mcp__plugin_paypal_paypal-sandbox__create_refund';

test('hook behaves fail-closed in every failure mode and calls the real dispatch', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'hook-')), 'h.db'); const db = await openDb(path); applySchema(db);
  db.run(`INSERT INTO payments(txn_id,captured_cents,currency,source) VALUES ('C60',6000,'USD','seed'),('C120',12000,'USD','seed')`);
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)).on('end', () => {
    if (process.env.HANG) return; const a = JSON.parse(b); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(check(db, M, a))); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const URL = `http://127.0.0.1:${srv.address().port}`;

  let r = await run(ev(NAME, { capture_id: 'C60', amount: { currency_code: 'USD', value: '18.00' } }), { LEASH_URL: URL });
  assert.equal(r.code, 0); assert.match(r.out, /"permissionDecision":"allow"/, 'in-mandate $18 refund allowed');

  r = await run(ev(NAME, { capture_id: 'C60', amount: { currency_code: 'USD', value: '900.00' } }, 'toolu_2'), { LEASH_URL: URL });
  assert.equal(r.code, 2); assert.match(r.err, /R-OVER-CAPTURE/, '$900 on a $60 capture blocked (exit 2)');

  r = await run(ev(NAME, { capture_id: 'C120', amount: { currency_code: 'USD', value: '75.00' } }, 'toolu_3'), { LEASH_URL: URL });
  assert.equal(r.code, 2); assert.match(r.err, /approve\/toolu_3#t=/, 'escalation returns the approval URL with the token in the fragment');

  r = await run(ev(NAME, { capture_id: 'C60' }, 'toolu_4'), { LEASH_URL: URL });          // omitted amount = full refund
  assert.ok(r.code === 0 || r.code === 2);

  r = await run(ev('mcp__plugin_paypal_paypal-sandbox__get_refund', { refund_id: 'X' }), { LEASH_URL: URL });
  assert.equal(r.code, 0, 'read-only tool passes');
  r = await run(ev('mcp__plugin_paypal_paypal-sandbox__accept_dispute_claim', { dispute_id: 'D' }), { LEASH_URL: URL });
  assert.equal(r.code, 2, 'unmapped money tool fails closed');

  r = await run('this is not json', { LEASH_URL: URL }); assert.equal(r.code, 2, 'garbage stdin => block');
  r = await run(ev(NAME, { capture_id: 'C60', amount: { currency_code: 'USD', value: 'abc' } }), { LEASH_URL: URL }); assert.equal(r.code, 2, 'malformed amount => block');
  r = await run(ev(NAME, { capture_id: 'C60', amount: { currency_code: 'USD', value: '1.00' } }), { LEASH_URL: 'http://127.0.0.1:1' }); assert.equal(r.code, 2, 'service down => block'); assert.match(r.err, /unreachable/);
  r = await run(ev(NAME, { capture_id: 'C60', amount: { currency_code: 'USD', value: '1.00' } }), { LEASH_URL: URL, LEASH_TEST_CRASH: '1' }); assert.equal(r.code, 2, 'hook crash => block, not exit 1');
  srv.close();
});

test('hung service: watchdog blocks well before the 5 s hook timeout', async () => {
  const srv = http.createServer(() => {}); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const r = await run(ev(NAME, { capture_id: 'C60', amount: { currency_code: 'USD', value: '1.00' } }), { LEASH_URL: `http://127.0.0.1:${srv.address().port}`, LEASH_WATCHDOG_MS: '1500' });
  assert.equal(r.code, 2); assert.ok(r.ms < 4000, `blocked after ${r.ms}ms`); srv.closeAllConnections?.(); srv.close();
});

test('the unhardened failure the docs warn about: a missing hook script exits non-2 (fails OPEN in Claude Code)', async () => {
  const code = await new Promise((res) => spawn(process.execPath, ['does-not-exist.mjs'], { cwd: import.meta.dirname }).on('close', res));
  assert.notEqual(code, 2, `exit ${code}: per the hooks docs only exit 2 blocks, so a missing/uninstalled hook does not protect`);
});

test('post and failure modes forward the correct outcome to /v1/result (real captured event shape)', async () => {
  const { readFileSync } = await import('node:fs');
  const real = readFileSync(new globalThis.URL('./fixtures/real-claude-code-hook-events.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const post = real.find((r) => r.mode === 'post').event;
  const got = []; const srv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)).on('end', () => { got.push(JSON.parse(b)); res.end('{}'); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const BASEURL = `http://127.0.0.1:${srv.address().port}`;
  let r = await new Promise((res) => { const p = spawn(process.execPath, ['hook.mjs', 'post'], { env: { ...process.env, LEASH_URL: BASEURL }, cwd: import.meta.dirname }); p.on('close', res); p.stdin.end(JSON.stringify(post)); });
  assert.equal(r, 0); assert.deepEqual(got[0], { actionId: post.tool_use_id, outcome: 'executed', refundId: 'FAKEREFUND123' });
  r = await new Promise((res) => { const p = spawn(process.execPath, ['hook.mjs', 'failure'], { env: { ...process.env, LEASH_URL: BASEURL }, cwd: import.meta.dirname }); p.on('close', res); p.stdin.end(JSON.stringify({ hook_event_name: 'PostToolUseFailure', tool_name: post.tool_name, tool_use_id: 'toolu_x', error: 'boom' })); });
  assert.equal(r, 0); assert.equal(got[1].outcome, 'failed'); srv.close();
});
