#!/usr/bin/env node
// Entry point the AGENT's MCP config launches. The PayPal credentials live in THIS process's environment only.
// Launch it from a secret store or launcher the agent cannot read: a token in an agent-readable settings file is not custody.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadMandate, MandateError } from './config.ts';
import { openDb } from './db.ts';
import { applySchema } from './schema.ts';
import { PayPalClient } from './paypal.ts';
import { createProxy } from './proxy.ts';

const fail = (why: string): never => {
  process.stderr.write(`Leash proxy: ${why}\n`);
  process.exit(1);
};

const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET; // keep credentials out of any child process environment

let mandate;
try {
  mandate = loadMandate(process.env.LEASH_MANDATE ?? 'mandate.json');
} catch (e) {
  fail(e instanceof MandateError ? `${e.message}` : String(e));
}
const db = await openDb(process.env.LEASH_DB ?? 'leash.db');
applySchema(db);
const paypal = id && secret ? new PayPalClient({ baseUrl: process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com', clientId: id, clientSecret: secret }) : null;
if (!paypal) process.stderr.write('Leash proxy: no PayPal credentials in this process, running SIMULATED (no money moves, no PayPal calls).\n');
await createProxy({ db, mandate: mandate!, paypal }, { exposeAmountTool: process.env.LEASH_EXPOSE_AMOUNT_TOOL === '1' }).connect(new StdioServerTransport());
