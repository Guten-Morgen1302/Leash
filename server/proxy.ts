// Leash credential-holding MCP proxy. It is the ONLY holder of the PayPal token; the agent sees only these tools.
// Primary interface is ITEM-SCOPED: the agent names line items and Leash computes the amount from trusted order data.
// Unmapped PayPal tools (invoices, disputes, subscriptions...) simply do not exist here: fail closed by omission.
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runRefund, type GateDeps, type GateOutcome } from './gate.ts';
import { toCents } from './paypal.ts';

const reply = (obj: object, isError = false) => ({ content: [{ type: 'text' as const, text: JSON.stringify(obj) }], isError });

// StdioServerTransport never sets extra.sessionId (confirmed against @modelcontextprotocol/sdk server/stdio.js): a stdio proxy
// is a single process per agent connection, so a stable per-PROCESS id (not a shared literal) is the right fallback. This keeps
// approval grants (keyed by args_hash + session_id) from being consumable across two different proxy processes that happen to
// share one leash.db and coincidentally request the same capture/amount/items.
const FALLBACK_SESSION_ID = `proxy-${randomUUID()}`;
// Recovery guidance: a block must not cost the customer a correct refund. It names no limit and offers no workaround past the gate:
// the retry is still checked, so it can only ever refund items the order data says are refundable and the mandate allows.
const NEXT_BLOCKED = 'Nothing was refunded. Do not retry the same request. If the customer reported specific faulty items, call get_order and refund_items for ONLY those items; anything beyond that needs a human, so tell the customer it has been passed on.';

const present = (o: GateOutcome) => {
  switch (o.status) {
    case 'executed': return reply({ status: 'executed', refund_id: o.refundId, amount: (o.amountCents / 100).toFixed(2), rule_id: o.ruleId, action_id: o.actionId, mode: o.mode });
    case 'blocked': return reply({ status: 'blocked', rule_id: o.ruleId, reason: o.reason, action_id: o.actionId, doc_url: `docs/policy.md#${o.ruleId.toLowerCase()}`, next: NEXT_BLOCKED }, true);
    case 'pending_approval': return reply({ status: 'pending_approval', rule_id: o.ruleId, reason: o.reason, approval_url: o.approvalUrl, next: 'A human must approve at the link, then call the same tool again with the same arguments.' }, true);
    case 'execution_failed': return reply({ status: 'execution_failed', reason: o.reason, ...(o.debugId ? { paypal_debug_id: o.debugId } : {}), action_id: o.actionId }, true);
    case 'unknown_outcome': return reply({ status: 'unknown_outcome', reason: o.reason, action_id: o.actionId }, true);
    case 'shadow': return reply({ status: 'recorded', note: 'Shadow mode: nothing was enforced.', would_have: o.wouldHave, ...(o.refundId ? { refund_id: o.refundId } : {}), mode: o.mode });
    case 'unavailable': return reply({ status: 'unavailable', reason: o.reason }, true);
  }
};

export interface ProxyOptions {
  exposeAmountTool?: boolean; // create_refund(amount): the weaker interface, off by default (see docs/IMPACT.md section 13)
}

export function createProxy(d: GateDeps, o: ProxyOptions = {}): McpServer {
  const server = new McpServer({ name: 'leash-paypal', version: '0.1.0' });
  const sessionOf = (extra: any) => String(extra?.sessionId ?? FALLBACK_SESSION_ID);

  server.tool('get_order', 'Get the refundable line items of the order paid by a PayPal capture (trusted merchant data). Always call this before refund_items.',
    { capture_id: z.string().min(3).max(64) },
    async ({ capture_id }) => {
      const order = d.db.one<{ order_id: string }>('SELECT order_id FROM orders WHERE capture_id=?', capture_id);
      if (!order) return reply({ status: 'unknown_order', reason: 'No order data is known for that payment.' }, true);
      const items = d.db.all<any>('SELECT item_id, name, unit_cents, qty, refunded_qty, reserved_qty, refundable, flag FROM order_items WHERE order_id=? ORDER BY item_id', order.order_id);
      return reply({ capture_id, items: items.map((i) => ({ item_id: i.item_id, name: i.name, unit_price: (i.unit_cents / 100).toFixed(2), qty: i.qty, still_refundable_qty: i.qty - i.refunded_qty - i.reserved_qty, refundable: !!i.refundable, ...(i.flag ? { restriction: i.flag } : {}) })) });
    });

  server.tool('refund_items', 'Refund specific line items of an order. You choose WHICH items, never the amount: Leash computes the amount from the order data. Refunding every item needs human approval.',
    { capture_id: z.string().min(3).max(64), items: z.array(z.object({ item_id: z.string().min(1).max(64), qty: z.number().int().min(1).max(1000).default(1) })).min(1).max(50), note_to_payer: z.string().max(255).optional() },
    async ({ capture_id, items, note_to_payer }, extra) =>
      present(await runRefund(d, { sessionId: sessionOf(extra), tool: 'refund_items', captureId: capture_id, amountCents: null, items: items.map((i) => ({ itemId: i.item_id, qty: i.qty })) }, note_to_payer)));

  if (o.exposeAmountTool)
    server.tool('create_refund', 'Refund a captured payment by amount, subject to the mandate (caps, approval).',
      { capture_id: z.string().min(3).max(64), amount: z.object({ currency_code: z.string().length(3), value: z.string() }).optional(), note_to_payer: z.string().max(255).optional() },
      async ({ capture_id, amount, note_to_payer }, extra) => {
        const cents = amount ? toCents(amount.value) : null;
        if (amount && cents === null) return reply({ status: 'rejected_invalid', reason: 'amount.value must be a decimal string like "18.00".' }, true);
        return present(await runRefund(d, { sessionId: sessionOf(extra), tool: 'refund', captureId: capture_id, amountCents: cents, ...(amount ? { currency: amount.currency_code } : {}) }, note_to_payer));
      });

  server.tool('get_refund', 'Read a refund (read-only).', { refund_id: z.string().min(3).max(64) }, async ({ refund_id }) => {
    if (!d.paypal) return reply({ status: 'unavailable', reason: 'Simulated mode has no PayPal connection.' }, true);
    try {
      return reply(await d.paypal.getRefund(refund_id));
    } catch (e: any) {
      return reply({ status: 'unavailable', reason: d.paypal.scrub(e?.message ?? 'lookup failed') }, true);
    }
  });
  return server;
}
