import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { outcomeFromEvent, parseToolResponse } from './result-parse.mjs';

const real = readFileSync(new URL('./fixtures/real-claude-code-hook-events.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const ofMode = (m) => real.filter((r) => r.mode === m).map((r) => r.event);

test('REAL Claude Code PreToolUse payload has the fields the hook reads', () => {
  const pre = ofMode('pre')[0];
  assert.equal(pre.hook_event_name, 'PreToolUse'); assert.equal(pre.tool_name, 'mcp__paypal-sandbox__create_refund');
  assert.match(pre.tool_use_id, /^toolu_/); assert.deepEqual(pre.tool_input, { capture_id: 'TEST123', amount: { currency_code: 'USD', value: '18.00' } });
  assert.equal(pre.mcp_server.name, 'paypal-sandbox'); assert.ok(pre.session_id);
});
test('REAL PostToolUse tool_response is an ARRAY of content blocks, and the old regex approach fails on it', () => {
  const post = ofMode('post')[0];
  assert.ok(Array.isArray(post.tool_response));
  const oldWay = /"status"\s*:\s*"(COMPLETED|PENDING)"/.test(JSON.stringify(post.tool_response));
  assert.equal(oldWay, false, 'the earlier regex would have missed every successful refund (recorded as unknown_outcome)');
  const { body } = parseToolResponse(post.tool_response); assert.equal(body.status, 'COMPLETED');
});
test('outcomeFromEvent: real success => executed with the refund id', () => {
  assert.deepEqual(outcomeFromEvent(ofMode('post')[0]), { outcome: 'executed', refundId: 'FAKEREFUND123' });
});
test('outcomeFromEvent: failure event, error flag, PayPal error object, garbage', () => {
  assert.equal(outcomeFromEvent({ hook_event_name: 'PostToolUseFailure', error: 'timeout' }).outcome, 'failed');
  assert.equal(outcomeFromEvent({ hook_event_name: 'PostToolUse', tool_response: [{ type: 'text', text: JSON.stringify({ name: 'UNPROCESSABLE_ENTITY', debug_id: 'x', details: [{ issue: 'REFUND_AMOUNT_EXCEEDED' }] }) }] }).outcome, 'failed');
  assert.equal(outcomeFromEvent({ hook_event_name: 'PostToolUse', tool_response: [{ type: 'text', text: 'weird' }] }).outcome, 'unknown');
  assert.equal(outcomeFromEvent({ hook_event_name: 'PostToolUse', tool_response: 'a string' }).outcome, 'unknown');
  assert.equal(outcomeFromEvent({ hook_event_name: 'PostToolUse' }).outcome, 'unknown');
});
test('the blocked call produced NO PostToolUse event (so no result is reported for it)', () => {
  assert.equal(ofMode('post').length, 1); assert.equal(ofMode('pre').length, 2);
});

const plugin = readFileSync(new URL('./fixtures/real-paypal-plugin-hook-events.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
test('REAL PayPal plugin: tool name is mcp__plugin_paypal_paypal-sandbox__create_refund and the matcher mcp__.*paypal.* covers it', () => {
  const pre = plugin.find((r) => r.mode === 'pre').event;
  assert.equal(pre.tool_name, 'mcp__plugin_paypal_paypal-sandbox__create_refund'); assert.equal(pre.mcp_server.source, 'plugin');
  assert.ok(new RegExp('^(mcp__.*paypal.*)$').test(pre.tool_name)); assert.deepEqual(Object.keys(pre.tool_input).sort(), ['amount', 'capture_id']);
});
test('REAL PayPal plugin error ({ok:false, code}) => failed, not unknown (before this fix it was left reserved forever)', () => {
  const post = plugin.find((r) => r.mode === 'post').event; assert.match(JSON.stringify(post.tool_response), /PAYPAL_API_SETUP_ERROR/);
  assert.equal(outcomeFromEvent(post).outcome, 'failed');
  assert.equal(outcomeFromEvent({ hook_event_name: 'PostToolUse', tool_response: [{ type: 'text', text: '{"ok":false,"code":"NETWORK_TIMEOUT"}' }] }).outcome, 'unknown', 'ambiguous network errors stay reserved');
});
test('REAL local @paypal/mcp success response => executed with refund id', () => {
  const resp = JSON.parse(readFileSync(new URL('./fixtures/real-local-mcp-refund-response.jsonl', import.meta.url), 'utf8'));
  assert.deepEqual(outcomeFromEvent({ hook_event_name: 'PostToolUse', tool_response: resp }), { outcome: 'executed', refundId: '32E0503386691101M' });
});
