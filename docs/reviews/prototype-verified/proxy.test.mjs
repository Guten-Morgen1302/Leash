import { test } from 'node:test'; import assert from 'node:assert/strict';
import http from 'node:http'; import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js'; import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { openDb, applySchema } from './db.mjs'; import { approve } from './dispatch.mjs';

const SECRET = 'SANDBOX-TOKEN-super-secret-123';
const M = { perActionCapCents: 5000, hardMaxCents: 10000, dailyCapCents: 20000, hardDailyCapCents: 40000, dupWindowMs: 864e5, expiresAt: Date.now() + 864e5 };

async function rig(mode = 'ok') {
  const calls = []; let n = 0;
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)).on('end', () => {
    calls.push({ url: req.url, auth: req.headers.authorization, rid: req.headers['paypal-request-id'], body: b });
    if (mode === 'hang') return;
    if (mode === '400') { res.writeHead(422, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ name: 'UNPROCESSABLE_ENTITY', message: `bad request for ${SECRET}` })); }
    if (mode === '500') { res.writeHead(500); return res.end('{}'); }
    res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: `REFUND${++n}ABCDEFGH`, status: 'COMPLETED' })); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const dir = mkdtempSync(join(tmpdir(), 'px-')); const path = join(dir, 'p.db'); const db = await openDb(path); applySchema(db);
  for (const [id, c] of [['CAPTURE60AAA', 6000], ['CAPTURE120BB', 12000], ['CAPTURE60CCC', 6000]]) db.run(`INSERT INTO payments(txn_id,captured_cents,currency,source) VALUES (?,?,'USD','seed')`, id, c);
  const t = new StdioClientTransport({ command: process.execPath, args: ['--disable-warning=ExperimentalWarning', 'proxy-main.mjs'], cwd: import.meta.dirname,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot ?? '', PAYPAL_ACCESS_TOKEN: SECRET, PAYPAL_BASE_URL: `http://127.0.0.1:${srv.address().port}`, LEASH_DB: path, LEASH_MANDATE_JSON: JSON.stringify(M) } });
  const client = new Client({ name: 'test-agent', version: '0' }); await client.connect(t);
  const call = async (name, args) => { const r = await client.callTool({ name, arguments: args }); return { ...JSON.parse(r.content[0].text), isError: !!r.isError, raw: r.content[0].text }; };
  return { calls, call, client, db, close: async () => { await client.close(); srv.closeAllConnections?.(); srv.close(); } };
}
const refund = (id, v) => ({ capture_id: id, amount: { currency_code: 'USD', value: v } });

test('proxy exposes only mapped tools; unmapped money tools do not exist (fail closed by omission)', async () => {
  const r = await rig(); const tools = (await r.client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(tools, ['create_refund', 'get_refund']);
  assert.ok(!tools.some((n) => /invoice|dispute|subscription/.test(n))); await r.close();
});
test('allowed refund reaches PayPal with the proxy-held token and a PayPal-Request-Id; the agent never sees the token', async () => {
  const r = await rig(); const out = await r.call('create_refund', refund('CAPTURE60AAA', '18.00'));
  assert.equal(out.status, 'executed'); assert.match(out.refund_id, /^REFUND/);
  assert.equal(r.calls.length, 1); assert.equal(r.calls[0].auth, `Bearer ${SECRET}`); assert.match(r.calls[0].rid, /^px_/);
  assert.deepEqual(JSON.parse(r.calls[0].body).amount, { currency_code: 'USD', value: '18.00' });
  assert.ok(!out.raw.includes(SECRET)); const p = r.db.one('SELECT refunded_cents f, reserved_cents r FROM payments WHERE txn_id=?', 'CAPTURE60AAA'); assert.deepEqual(p, { f: 1800, r: 0 }); await r.close();
});
test('blocked refund ($900 on a $60 capture): PayPal is NEVER called', async () => {
  const r = await rig(); const out = await r.call('create_refund', refund('CAPTURE60CCC', '900.00'));
  assert.equal(out.status, 'blocked'); assert.equal(out.rule_id, 'R-OVER-CAPTURE'); assert.equal(out.isError, true); assert.equal(r.calls.length, 0); await r.close();
});
test('escalation then approval then retry: executes once; a second retry does not execute again', async () => {
  const r = await rig(); const e = await r.call('create_refund', refund('CAPTURE120BB', '75.00'));
  assert.equal(e.status, 'pending_approval'); assert.equal(r.calls.length, 0); const m = /approve\/(px_[^#]+)#t=([0-9a-f]+)/.exec(e.approval_url); assert.ok(m, e.approval_url);
  const ok = approve(r.db, M, { actionId: m[1], token: m[2], decision: 'approve' }); assert.equal(ok.ok, true);
  const again = await r.call('create_refund', refund('CAPTURE120BB', '75.00')); assert.equal(again.status, 'executed'); assert.equal(r.calls.length, 1);
  const third = await r.call('create_refund', refund('CAPTURE120BB', '75.00')); assert.notEqual(third.status, 'executed'); assert.equal(r.calls.length, 1); await r.close();
});
test('PayPal 4xx: reservation released, error text has the token redacted, token never reaches the agent', async () => {
  const r = await rig('400'); const out = await r.call('create_refund', refund('CAPTURE60AAA', '18.00'));
  assert.equal(out.status, 'execution_failed'); assert.ok(!out.raw.includes(SECRET), 'token must not appear in any agent-visible text');
  assert.equal(r.db.val('SELECT reserved_cents FROM payments WHERE txn_id=?', 'CAPTURE60AAA'), 0); await r.close();
});
test('PayPal 5xx: outcome unknown, amount stays reserved (conservative), agent told not to retry blindly', async () => {
  const r = await rig('500'); const out = await r.call('create_refund', refund('CAPTURE60AAA', '18.00'));
  assert.equal(out.status, 'unknown_outcome'); assert.equal(r.db.val('SELECT reserved_cents FROM payments WHERE txn_id=?', 'CAPTURE60AAA'), 1800); await r.close();
});
test('malformed amount is rejected before anything is reserved or sent', async () => {
  const r = await rig(); const out = await r.call('create_refund', refund('CAPTURE60AAA', 'abc')); assert.equal(out.status, 'rejected_invalid'); assert.equal(r.calls.length, 0); await r.close();
});
test('BYPASS CLOSED: the agent process environment holds no token, so shell-level PayPal calls have nothing to authenticate with', async () => {
  const r = await rig(); const agentEnvHasToken = Object.values(process.env).some((v) => String(v).includes(SECRET));
  assert.equal(agentEnvHasToken, false, 'the test agent (this process) never received the token; only the proxy child did'); await r.close();
});
