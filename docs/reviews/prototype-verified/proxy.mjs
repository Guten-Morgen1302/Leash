// Leash credential-holding proxy: an MCP server that is the ONLY holder of the PayPal token.
// The agent is configured with this server instead of PayPal's, so it has no token to misuse or leak.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { check, result } from './dispatch.mjs';

const toCents = (v) => { const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(v ?? '').trim()); return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0) : null; };
const fmt = (c) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
const reply = (obj, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], isError });

export function createProxy({ db, mandate, paypalBase, getToken, publicUrl = 'http://127.0.0.1:4317', timeoutMs = 10_000, fetchImpl = fetch }) {
  const redact = (s) => { const t = getToken(); return t ? String(s).split(t).join('[token removed]') : String(s); };
  const server = new McpServer({ name: 'leash-paypal', version: '0.1.0' });

  server.tool('create_refund', 'Refund a captured PayPal payment, subject to the merchant mandate (caps, approval).',
    { capture_id: z.string().regex(/^[A-Z0-9]{10,25}$|^[A-Za-z0-9_-]{3,40}$/), amount: z.object({ currency_code: z.string().length(3), value: z.string() }).optional(), note_to_payer: z.string().max(255).optional() },
    async (args, extra) => {
      const actionId = `px_${randomUUID()}`; const sessionId = String(extra?.sessionId ?? 'proxy');
      const cents = args.amount ? toCents(args.amount.value) : null;
      if (args.amount && cents === null) return reply({ status: 'rejected_invalid', reason: 'amount.value must be a decimal string like "18.00".' }, true);
      let d;
      try { d = check(db, mandate, { actionId, sessionId, tool: 'refund', captureId: args.capture_id, amountCents: cents, currency: args.amount?.currency_code }); }
      catch (e) { return reply({ status: 'blocked', reason: 'Leash is busy or unavailable; nothing was refunded (failing closed).' }, true); }
      if (d.status === 'pending_approval') return reply({ status: 'pending_approval', rule_id: d.ruleId, reason: d.reason, approval_url: d.approvalUrl?.replace('http://127.0.0.1:4317', publicUrl), next: 'A human must approve, then call create_refund again with the same arguments.' }, true);
      if (d.status !== 'allowed') return reply({ status: 'blocked', rule_id: d.ruleId, reason: d.reason, action_id: d.actionId, doc_url: `docs/policy.md#${d.ruleId.toLowerCase()}` }, true);
      const row = db.one('SELECT amount_cents a FROM actions WHERE id=?', actionId); const pay = db.one('SELECT currency FROM payments WHERE txn_id=?', args.capture_id);
      const body = { amount: { currency_code: args.amount?.currency_code ?? pay?.currency ?? 'USD', value: fmt(row.a) }, ...(args.note_to_payer ? { note_to_payer: args.note_to_payer } : {}) };
      let outcome = 'unknown', refundId, status = 0, text = '';
      try {
        const r = await fetchImpl(`${paypalBase}/v2/payments/captures/${encodeURIComponent(args.capture_id)}/refund`, { method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': actionId }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
        status = r.status; text = await r.text(); let j = {}; try { j = JSON.parse(text); } catch {}
        if (r.ok && /COMPLETED|PENDING/.test(String(j.status))) { outcome = 'executed'; refundId = j.id; }
        else if (r.status >= 400 && r.status < 500) outcome = 'failed';
        else outcome = 'unknown';
      } catch { outcome = 'unknown'; }
      result(db, { actionId, outcome, refundId });
      if (outcome === 'executed') return reply({ status: 'executed', refund_id: refundId, rule_id: d.ruleId, action_id: actionId, amount: body.amount });
      if (outcome === 'failed') return reply({ status: 'execution_failed', reason: redact(`PayPal rejected the refund (HTTP ${status}). No money moved; the reservation was released.`), paypal: redact(text).slice(0, 400), action_id: actionId }, true);
      return reply({ status: 'unknown_outcome', reason: 'No confirmed result from PayPal. The amount stays reserved until reconciled; do not retry blindly.', action_id: actionId }, true);
    });

  server.tool('get_refund', 'Read a refund (read-only).', { refund_id: z.string().min(3).max(40) }, async ({ refund_id }) => {
    try { const r = await fetchImpl(`${paypalBase}/v2/payments/refunds/${encodeURIComponent(refund_id)}`, { headers: { Authorization: `Bearer ${getToken()}` }, signal: AbortSignal.timeout(timeoutMs) });
      return reply(JSON.parse(redact(await r.text())), !r.ok); } catch { return reply({ status: 'unavailable' }, true); } });
  return server;   // unmapped PayPal tools (send_invoice, accept_dispute_claim, ...) are simply NOT offered: fail closed by omission
}
