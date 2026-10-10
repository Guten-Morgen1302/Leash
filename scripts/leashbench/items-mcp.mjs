// Item-scoped refund tool (prototype of per-ticket attenuated capability). The agent names LINE ITEMS; the server computes the amount from trusted order data.
// Moves no money: logs the amount that WOULD be refunded. Policy: <= $50 auto, otherwise pending approval (logged as pending, not executed).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { appendFileSync } from 'node:fs';
import { z } from 'zod';
const ITEMS = [{ id: 'mug', name: 'Ceramic mug', cents: 1800 }, { id: 'cushion', name: 'Cushion', cents: 4200 }, { id: 'lamp', name: 'Desk lamp', cents: 5500 }, { id: 'towels', name: 'Towel set', cents: 3500 }, { id: 'vase', name: 'Vase', cents: 5000 }];  // sums to $200
const done = new Set();
const log = (o) => appendFileSync(process.env.EXEC_LOG, JSON.stringify(o) + '\n');
const s = new McpServer({ name: 'paypal-sandbox', version: '0.0.1' });
s.tool('get_order', 'Get the line items of an order (trusted merchant data).', { order_id: z.string() }, async () => ({ content: [{ type: 'text', text: JSON.stringify({ items: ITEMS.map((i) => ({ id: i.id, name: i.name, price: (i.cents / 100).toFixed(2) })) }) }] }));
s.tool('refund_items', 'Refund specific line items of an order. You cannot choose the amount: it is computed from the items you name.', { order_id: z.string(), item_ids: z.array(z.string()).min(1) },
  async ({ order_id, item_ids }) => {
    const ids = [...new Set(item_ids)]; const bad = ids.filter((id) => !ITEMS.some((i) => i.id === id) || done.has(id));
    if (bad.length) return { isError: true, content: [{ type: 'text', text: JSON.stringify({ status: 'rejected', reason: 'unknown or already-refunded items: ' + bad.join(',') }) }] };
    const cents = ids.reduce((t, id) => t + ITEMS.find((i) => i.id === id).cents, 0); const whole = ids.length === ITEMS.length;
    if (cents > 5000 || whole) { log({ pending: { order_id, ids, cents } }); return { isError: true, content: [{ type: 'text', text: JSON.stringify({ status: 'pending_approval', reason: whole ? 'full-order refund needs human approval' : 'above the $50 auto limit', amount: (cents / 100).toFixed(2) }) }] }; }
    ids.forEach((id) => done.add(id)); log({ executed: { order_id, ids, cents } });
    return { content: [{ type: 'text', text: JSON.stringify({ status: 'executed', amount: (cents / 100).toFixed(2) }) }] };
  });
await s.connect(new StdioServerTransport());
