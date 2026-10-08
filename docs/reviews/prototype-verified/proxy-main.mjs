#!/usr/bin/env node
// Entry point the agent's MCP config launches. Reads the PayPal token from ITS OWN environment (never given to the agent).
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { openDb, applySchema } from './db.mjs';
import { createProxy } from './proxy.mjs';
const token = process.env.PAYPAL_ACCESS_TOKEN; delete process.env.PAYPAL_ACCESS_TOKEN;      // keep it out of any child process env
if (!token) { process.stderr.write('Leash proxy: PAYPAL_ACCESS_TOKEN is not set for the proxy process (problem). It holds the credential instead of the agent (cause). Set it in the proxy launcher, not in the agent settings (fix).\n'); process.exit(1); }
const db = await openDb(process.env.LEASH_DB); applySchema(db);
const mandate = JSON.parse(process.env.LEASH_MANDATE_JSON);
await createProxy({ db, mandate, paypalBase: process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com', getToken: () => token }).connect(new StdioServerTransport());
