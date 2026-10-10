import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { createProxy } from '../server/proxy.ts';
import { parseMandate } from '../server/config.ts';
import { PayPalClient } from '../server/paypal.ts';
import { tempDb, seedOrder, fakePayPal, MANDATE_JSON } from './helpers.ts';

const mandate = parseMandate(MANDATE_JSON);
const listen = (app: any) => new Promise<{ base: string; close: () => void }>((r) => { const s = app.listen(0, '127.0.0.1', () => r({ base: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, close: () => { s.closeAllConnections(); s.close(); } })); });
const post = (base: string, path: string, body: unknown, token?: string) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

describe('HTTP API', () => {
  test('hook endpoints: 401 without bearer, 200 with; 503 in production when LEASH_TOKEN unset', async () => {
    const { db } = await tempDb(); seedOrder(db, 'CAP1');
    const body = { actionId: 'a1', sessionId: 's', tool: 'refund_items', captureId: 'CAP1', amountCents: null, items: [{ itemId: 'mug', qty: 1 }] };
    const a = await listen(createApp({ db, mandate, paypal: null }, { token: 'T0K' }));
    assert.equal((await post(a.base, '/v1/check', body)).status, 401);
    assert.equal((await post(a.base, '/v1/check', body, 'wrong')).status, 401);
    const ok = await post(a.base, '/v1/check', body, 'T0K'); assert.equal(ok.status, 200);
    assert.equal((await post(a.base, '/v1/result', { actionId: 'a1', outcome: 'executed' })).status, 401);
    assert.equal((await post(a.base, '/v1/result', { actionId: 'a1', outcome: 'nope' }, 'T0K')).status, 400);
    a.close();
    const p = await listen(createApp({ db, mandate, paypal: null }, { production: true }));
    assert.equal((await post(p.base, '/v1/check', body)).status, 503);
    p.close();
  });
  test('unknown /v1 path is 404 JSON; bad input is 400; oversized body rejected; mandate page served', async () => {
    const { db } = await tempDb();
    const a = await listen(createApp({ db, mandate, paypal: null }));
    assert.equal((await fetch(a.base + '/v1/nope')).status, 404);
    assert.equal((await post(a.base, '/v1/check', { tool: 'x' })).status, 400);
    assert.equal((await post(a.base, '/v1/refund', { pad: 'x'.repeat(20000) })).status, 400);
    const m = await (await fetch(a.base + '/v1/mandate')).json() as any; assert.ok(m.lines.length > 3);
    a.close();
  });
  test('/v1/refund drives the full pipeline and the ledger chain stays valid', async () => {
    const { db } = await tempDb(); seedOrder(db, 'CAP1');
    const a = await listen(createApp({ db, mandate, paypal: null }));
    const r = await (await post(a.base, '/v1/refund', { sessionId: 's', captureId: 'CAP1', items: [{ itemId: 'mug', qty: 1 }] })).json() as any;
    assert.equal(r.status, 'executed');
    const l = await (await fetch(a.base + '/v1/ledger')).json() as any;
    assert.equal(l.mode, 'SIMULATED'); assert.ok(l.total >= 2); assert.equal(l.chain.ok, true);
    a.close();
  });
});

describe('MCP proxy (in-memory transport)', () => {
  const connect = async (d: any, o = {}) => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createProxy(d, o).connect(b);
    const c = new Client({ name: 't', version: '1' }); await c.connect(a); return c;
  };
  const txt = (r: any) => JSON.parse(r.content[0].text);

  test('only item-scoped tools exist by default; amount tool is opt-in', async () => {
    const { db } = await tempDb();
    const c1 = await connect({ db, mandate, paypal: null });
    assert.deepEqual((await c1.listTools()).tools.map((t) => t.name).sort(), ['get_order', 'get_refund', 'refund_items']);
    const c2 = await connect({ db, mandate, paypal: null }, { exposeAmountTool: true });
    assert.ok((await c2.listTools()).tools.some((t) => t.name === 'create_refund'));
  });
  test('legit item refund executes live (fake PayPal); full-order attack is stopped; agent output never carries the token', async () => {
    const f = await fakePayPal('SUPER-SECRET-TOKEN'); const { db } = await tempDb(); seedOrder(db, 'CAP1');
    const pp = new PayPalClient({ baseUrl: 'https://api-m.sandbox.paypal.com', clientId: 'i', clientSecret: 'SUPER-SECRET-CLIENT', fetchImpl: ((u: any, o: any) => fetch(String(u).replace('https://api-m.sandbox.paypal.com', f.url), o)) as typeof fetch });
    const c = await connect({ db, mandate, paypal: pp });
    const seen: string[] = [];
    const order = await c.callTool({ name: 'get_order', arguments: { capture_id: 'CAP1' } }); seen.push(JSON.stringify(order));
    assert.equal(txt(order).items.length, 5);
    const ok = await c.callTool({ name: 'refund_items', arguments: { capture_id: 'CAP1', items: [{ item_id: 'mug', qty: 1 }] } }); seen.push(JSON.stringify(ok));
    assert.equal(txt(ok).status, 'executed'); assert.equal(txt(ok).amount, '18.00');
    const all = await c.callTool({ name: 'refund_items', arguments: { capture_id: 'CAP1', items: ['cushion', 'lamp', 'towels', 'vase'].map((i) => ({ item_id: i, qty: 1 })) } }); seen.push(JSON.stringify(all));
    assert.equal(all.isError, true); assert.ok(['blocked', 'pending_approval'].includes(txt(all).status), 'attack must not execute'); assert.equal(txt(all).rule_id, 'R-HARD-MAX');
    assert.equal(f.calls.filter((x) => x.url.endsWith('/refund')).length, 1, 'only the legitimate $18 reached PayPal');
    const bogus = await c.callTool({ name: 'refund_items', arguments: { capture_id: 'CAP1', items: [{ item_id: 'ferrari', qty: 1 }] } }); seen.push(JSON.stringify(bogus));
    assert.equal(bogus.isError, true);
    for (const s of seen) assert.ok(!/SUPER-SECRET|Bearer/.test(s), 'credential leaked to agent output');
    await f.close();
  });
});
