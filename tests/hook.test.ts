import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { parseMandate } from '../server/config.ts';
import { tempDb, seedOrder, MANDATE_JSON } from './helpers.ts';

const events = readFileSync('tests/fixtures/real-paypal-plugin-hook-events.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l)) as { mode: string; event: any }[];
const run = (mode: string, event: object, env: Record<string, string> = {}) =>
  spawnSync(process.execPath, ['hooks/leash-hook.mjs', mode], { input: JSON.stringify(event), env: { ...process.env, ...env }, encoding: 'utf8', timeout: 8000 });
const pre = (amount: string, cap = 'CAP1') => ({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'mcp__plugin_paypal_paypal-sandbox__create_refund', tool_use_id: 'toolu_' + Math.random().toString(36).slice(2), tool_input: { capture_id: cap, amount: { currency_code: 'USD', value: amount } } });

describe('hook failure modes (only exit 2 blocks, so every failure path must exit 2)', () => {
  test('Leash unreachable: refund is blocked (exit 2), not allowed', () => {
    const r = run('pre', pre('18.00'), { LEASH_URL: 'http://127.0.0.1:1' });
    assert.equal(r.status, 2); assert.match(r.stderr, /Leash/);
  });
  test('hook crash: exit 2', () => assert.equal(run('pre', pre('18.00'), { LEASH_TEST_CRASH: '1' }).status, 2));
  test('garbage on stdin: exit 2', () => {
    const r = spawnSync(process.execPath, ['hooks/leash-hook.mjs', 'pre'], { input: '{not json', encoding: 'utf8', timeout: 8000 });
    assert.equal(r.status, 2);
  });
  test('real recorded events parse without crashing the hook (pre events reach a decision)', () => {
    for (const e of events.filter((x) => x.mode === 'pre')) assert.notEqual(run('pre', e.event, { LEASH_URL: 'http://127.0.0.1:1' }).status, 1, 'exit 1 would fail OPEN');
  });
});

describe('hook against a live Leash', () => {
  test('over-cap refund exits 2 with the rule; in-cap amount-based refund is judged by policy', async () => {
    const { db } = await tempDb(); seedOrder(db, 'CAP1');
    const s: any = createApp({ db, mandate: parseMandate(MANDATE_JSON), paypal: null }, { token: 'HK' }).listen(0, '127.0.0.1');
    await new Promise((r) => s.once('listening', r));
    const env = { LEASH_URL: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, LEASH_TOKEN: 'HK' };
    // run in a child so the event loop of this process can serve requests
    const { spawn } = await import('node:child_process');
    const go = (ev: object) => new Promise<{ code: number | null; err: string; out: string }>((res) => {
      const c = spawn(process.execPath, ['hooks/leash-hook.mjs', 'pre'], { env: { ...process.env, ...env } });
      let err = '', out = ''; c.stderr.on('data', (d) => (err += d)); c.stdout.on('data', (d) => (out += d));
      c.on('close', (code) => res({ code, err, out })); c.stdin.end(JSON.stringify(ev));
    });
    const big = await go(pre('150.00')); assert.equal(big.code, 2); assert.match(big.err, /R-/);
    const small = await go(pre('18.00')); assert.equal(small.code, 0); assert.match(small.out, /allow/);
    const noToken = await new Promise<number | null>((res) => { const c = spawn(process.execPath, ['hooks/leash-hook.mjs', 'pre'], { env: { ...process.env, LEASH_URL: env.LEASH_URL, LEASH_TOKEN: '' } }); c.on('close', res); c.stdin.end(JSON.stringify(pre('18.00'))); });
    assert.equal(noToken, 2, 'missing bearer must block, not allow');
    s.closeAllConnections(); s.close();
  });
});
