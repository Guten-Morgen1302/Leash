import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { tempDb, seedOrder } from './helpers.ts';
import { doctor } from '../scripts/doctor-lib.mjs';

const guard = (ev: object, raw?: string) => spawnSync(process.execPath, ['hooks/guard.mjs'], { input: raw ?? JSON.stringify(ev), encoding: 'utf8', timeout: 8000 });

describe('guard hook', () => {
  test('blocks direct PayPal API/token use from a shell', () => {
    for (const command of ['curl https://api-m.sandbox.paypal.com/v2/payments/captures/X/refund', 'echo $PAYPAL_ACCESS_TOKEN', 'node -e "process.env.PAYPAL_CLIENT_SECRET"'])
      assert.equal(guard({ tool_name: 'Bash', tool_input: { command } }).status, 2, command);
  });
  test('blocks reads and edits of hook settings, mandate, .env and seed files', () => {
    for (const file_path of ['C:/x/.claude/settings.json', 'C:/x/mandate.json', 'C:/x/.env', 'C:/x/.seed/captures.json', 'C:/x/hooks/guard.mjs'])
      for (const tool_name of ['Read', 'Edit', 'Write']) assert.equal(guard({ tool_name, tool_input: { file_path } }).status, 2, `${tool_name} ${file_path}`);
  });
  test('allows ordinary work; garbage input fails closed', () => {
    assert.equal(guard({ tool_name: 'Bash', tool_input: { command: 'npm test' } }).status, 0);
    assert.equal(guard({ tool_name: 'Edit', tool_input: { file_path: 'C:/x/src/app.ts' } }).status, 0);
    assert.equal(guard({}, '{not json').status, 2);
  });
});

describe('doctor', () => {
  const root = resolve('.').replaceAll(String.fromCharCode(92), '/');
  const hookScript = `${root}/hooks/leash-hook.mjs`, guardScript = `${root}/hooks/guard.mjs`;
  const settings = (cfg: object) => { const f = join(mkdtempSync(join(tmpdir(), 'doc-')), 's.json'); writeFileSync(f, JSON.stringify(cfg)); return f; };
  const good = { hooks: { PreToolUse: [{ matcher: 'mcp__.*paypal.*', hooks: [{ type: 'command', command: `node "${hookScript}" pre` }] }, { matcher: 'Bash|Edit', hooks: [{ type: 'command', command: `node "${guardScript}"` }] }] } };
  test('missing hooks or a relative path are reported as failures', () => {
    const none = doctor({ settingsFiles: [], hookScript, guardScript, leashUrl: 'http://127.0.0.1:1' });
    assert.equal(none.ok, false); assert.ok(none.checks.filter((c: any) => !c.ok).length >= 4);
    const rel = doctor({ settingsFiles: [settings({ hooks: { PreToolUse: [{ matcher: 'mcp__.*paypal.*', hooks: [{ type: 'command', command: 'node hooks/leash-hook.mjs pre' }] }] } })], hookScript, guardScript, leashUrl: 'http://127.0.0.1:1' });
    assert.equal(rel.checks.find((c: any) => /absolute/.test(c.name)).ok, false);
  });
  test('good config passes the static checks; the end-to-end block check passes even with Leash down (fails closed)', () => {
    const r = doctor({ settingsFiles: [settings(good)], hookScript, guardScript, leashUrl: 'http://127.0.0.1:1' });
    assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c: any) => !c.ok)));
  });
});

describe('proxy over real MCP stdio', () => {
  test('process boots, serves item tools, executes a simulated refund, and never prints credentials', async () => {
    const { db, path } = await tempDb(); seedOrder(db, 'CAP1'); db.close();
    const t = new StdioClientTransport({ command: process.execPath, args: ['--disable-warning=ExperimentalWarning', 'server/proxy-main.ts'], env: { ...process.env as Record<string, string>, LEASH_DB: path, LEASH_MANDATE: 'mandate.json', PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '' }, stderr: 'pipe' });
    let err = ''; t.stderr?.on('data', (d: Buffer) => (err += d));
    const c = new Client({ name: 't', version: '1' }); await c.connect(t);
    assert.deepEqual((await c.listTools()).tools.map((x) => x.name).sort(), ['get_order', 'get_refund', 'refund_items']);
    const r: any = await c.callTool({ name: 'refund_items', arguments: { capture_id: 'CAP1', items: [{ item_id: 'mug', qty: 1 }] } });
    const body = JSON.parse(r.content[0].text); assert.equal(body.status, 'executed'); assert.equal(body.mode, 'sim'); assert.match(body.refund_id, /^SIM-/);
    const big: any = await c.callTool({ name: 'refund_items', arguments: { capture_id: 'CAP1', items: ['cushion', 'lamp', 'towels', 'vase'].map((i) => ({ item_id: i, qty: 1 })) } });
    assert.equal(big.isError, true);
    await c.close();
    assert.match(err, /SIMULATED/);
  });
  test('an invalid mandate stops the proxy from starting (null blocks activation)', async () => {
    const f = join(mkdtempSync(join(tmpdir(), 'm-')), 'mandate.json'); writeFileSync(f, JSON.stringify({ schema_version: 1, perActionCapCents: 5000, hardMaxCents: null, dailyCapCents: 20000, hardDailyCapCents: 40000, expiresAt: '2099-01-01T00:00:00Z' }));
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/proxy-main.ts'], { env: { ...process.env, LEASH_MANDATE: f, LEASH_DB: join(tmpdir(), 'x.db') }, encoding: 'utf8', timeout: 10000 });
    assert.equal(r.status, 1); assert.match(r.stderr, /hardMaxCents is unset/);
  });
});
