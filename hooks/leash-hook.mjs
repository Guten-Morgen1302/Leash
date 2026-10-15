#!/usr/bin/env node
// Hardened PreToolUse hook (verification harness). Claude Code treats exit 1 / timeouts / crashes as NON-blocking (fails open),
// so EVERY failure path must end in exit 2 (blocking) before the hook timeout.
const LEASH = process.env.LEASH_URL ?? 'http://127.0.0.1:4317';
const mode = process.argv[2] ?? 'pre';                                         // pre | post | failure
const WATCHDOG_MS = Number(process.env.LEASH_WATCHDOG_MS ?? 2500);            // must be < the hook "timeout" in settings (5 s)
const block = (why) => { process.stderr.write(`Leash blocked this call. ${why}\n`); process.exit(2); };
const allow = (why) => { process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: why } })); process.exit(0); };

const wd = setTimeout(() => block('Leash did not answer in time (failing closed).'), WATCHDOG_MS);
process.on('uncaughtException', (e) => block(`Internal hook error (${e?.message}); failing closed.`));
process.on('unhandledRejection', (e) => block(`Internal hook error (${e?.message ?? e}); failing closed.`));

const raw = await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => r(s)); });
let ev; try { ev = JSON.parse(raw); } catch { block('Could not read the hook input.'); }
const tool = String(ev.tool_name ?? '').split('__').pop();
if (mode === 'post' || mode === 'failure') {                                  // PostToolUse / PostToolUseFailure: report only, never block
  clearTimeout(wd);
  try {
    const { outcomeFromEvent } = await import('./result-parse.mjs');
    const o = outcomeFromEvent({ ...ev, hook_event_name: mode === 'failure' ? 'PostToolUseFailure' : ev.hook_event_name });
    await fetch(`${LEASH}/v1/result`, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.LEASH_TOKEN ? { authorization: `Bearer ${process.env.LEASH_TOKEN}` } : {}) }, body: JSON.stringify({ actionId: ev.tool_use_id, outcome: o.outcome, refundId: o.refundId }), signal: AbortSignal.timeout(2000) });
  } catch { /* the sweep turns a missing result into unknown_outcome, which still counts toward every cap */ }
  process.exit(0);
}
if (process.env.LEASH_TEST_CRASH) throw new Error('simulated crash');
// Explicit allowlist, not a name-pattern heuristic: a tool must be VERIFIED read-only (docs/Backend/PAYPAL_MCP_AUDIT.md), not just
// shaped like one. A future or unenumerated PayPal tool that happens to start with get/list/show/search is NOT trusted by name alone;
// it falls through to the block below (fail closed by omission), same policy the MCP proxy already applies to unmapped tools.
const VERIFIED_READ_ONLY = new Set(['get_refund', 'list_disputes', 'get_dispute', 'list_transactions']);
if (VERIFIED_READ_ONLY.has(tool)) allow('read-only (verified)');
if (tool !== 'create_refund' && tool !== 'refund_items') block(`Tool "${tool}" has no mandate rule (fail closed).`);
const i = ev.tool_input ?? {};
const items = tool === 'refund_items' ? (Array.isArray(i.items) ? i.items.map((x) => ({ itemId: String(x.item_id ?? x.itemId), qty: Number(x.qty ?? 1) })) : null) : undefined;
if (items === null || (items && !items.length)) block('refund_items needs a non-empty items array.');
const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(i.amount?.value ?? '').trim());
const cents = items ? null : i.amount ? (m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0) : null) : null;
if (!i.capture_id || (!items && i.amount && cents === null)) block('Refund arguments are missing or malformed.');
const r = await fetch(`${LEASH}/v1/check`, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.LEASH_TOKEN ? { authorization: `Bearer ${process.env.LEASH_TOKEN}` } : {}) },
  body: JSON.stringify({ actionId: ev.tool_use_id, sessionId: ev.session_id, tool: items ? 'refund_items' : 'refund', captureId: i.capture_id, amountCents: cents, currency: i.amount?.currency_code, ...(items ? { items } : {}) }),
  signal: AbortSignal.timeout(2000) }).catch((e) => block(`Leash service unreachable (${e.cause?.code ?? e.name}).`));
if (!r.ok) block(`Leash service error ${r.status}.`);
const d = await r.json(); clearTimeout(wd);
if (d.status === 'allowed') allow(`Leash ${d.ruleId}`);
if (d.status === 'pending_approval') block(`${d.reason} Approve at ${d.approvalUrl} then ask again.`);
block(`${d.reason} (rule ${d.ruleId})`);
