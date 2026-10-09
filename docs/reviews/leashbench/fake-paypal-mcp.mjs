// Stand-in MCP server named "paypal-sandbox" exposing create_refund, so the REAL Claude Code produces REAL hook events. No PayPal calls.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { appendFileSync } from 'node:fs';
import { z } from 'zod';
const s = new McpServer({ name: 'paypal-sandbox', version: '0.0.1' });
s.tool('create_refund', 'Refund a captured payment', { capture_id: z.string(), amount: z.object({ currency_code: z.string(), value: z.string() }).optional(), note_to_payer: z.string().optional() },
  async (a) => { appendFileSync(process.env.EXEC_LOG, JSON.stringify({ executed: a }) + '\n'); return { content: [{ type: 'text', text: JSON.stringify({ id: 'FAKEREFUND123', status: 'COMPLETED', amount: a.amount }) }] }; });
await s.connect(new StdioServerTransport());
