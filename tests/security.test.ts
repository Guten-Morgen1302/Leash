import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { parseMandate } from '../server/config.ts';
import { PayPalClient } from '../server/paypal.ts';
import { tempDb, seedOrder, fakePayPal, MANDATE_JSON } from './helpers.ts';

const mandate = parseMandate(MANDATE_JSON);
const listen = (app: any) => new Promise<{ base: string; close: () => void }>((r) => { const s = app.listen(0, '127.0.0.1', () => r({ base: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, close: () => { s.closeAllConnections(); s.close(); } })); });

test('S1: in live mode POST /v1/refund moves real (sandbox) money, so it needs the bearer token; unset token fails closed', async () => {
  const f = await fakePayPal(); const { db } = await tempDb(); seedOrder(db, 'CAP1');
  const pp = new PayPalClient({ baseUrl: 'https://api-m.sandbox.paypal.com', clientId: 'i', clientSecret: 's', fetchImpl: ((u: any, o: any) => fetch(String(u).replace('https://api-m.sandbox.paypal.com', f.url), o)) as typeof fetch });
  const body = JSON.stringify({ sessionId: 's', captureId: 'CAP1', items: [{ itemId: 'mug', qty: 1 }] });
  const post = (base: string, token?: string) => fetch(base + '/v1/refund', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body });
  const withTok = await listen(createApp({ db, mandate, paypal: pp }, { token: 'T' }));
  assert.equal((await post(withTok.base)).status, 401); assert.equal((await post(withTok.base, 'bad')).status, 401);
  assert.equal(f.calls.filter((c) => c.url.endsWith('/refund')).length, 0, 'no money moved without the token');
  assert.equal((await post(withTok.base, 'T')).status, 200);
  const noTok = await listen(createApp({ db, mandate, paypal: pp }, {}));
  assert.equal((await post(noTok.base)).status, 503, 'live mode with no token configured is disabled, even outside production');
  withTok.close(); noTok.close(); await f.close();
});

test('S2: simulated mode keeps /v1/refund open (no money exists); ledger rows do not expose payload (capture ids, items)', async () => {
  const { db } = await tempDb(); seedOrder(db, 'CAP1');
  const a = await listen(createApp({ db, mandate, paypal: null }));
  const r = await fetch(a.base + '/v1/refund', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 's', captureId: 'CAP1', items: [{ itemId: 'mug', qty: 1 }] }) });
  assert.equal(r.status, 200);
  const l = await (await fetch(a.base + '/v1/ledger')).json() as any;
  assert.ok(l.rows.length > 0); assert.ok(l.rows.every((x: any) => !('payload_json' in x)), 'payload_json (capture ids, item names) must not be served unauthenticated');
  assert.ok(!JSON.stringify(l).includes('CAP1'));
  a.close();
});

test('S3: a client-supplied X-Forwarded-For must not change the rate-limit key unless a proxy is configured', async () => {
  const { db } = await tempDb();
  const a = await listen(createApp({ db, mandate, paypal: null }, { rateLimitPerMin: 3 }));
  const codes: number[] = [];
  for (let i = 0; i < 6; i++) codes.push((await fetch(a.base + '/v1/mandate', { headers: { 'x-forwarded-for': `10.0.0.${i}` } })).status);
  assert.ok(codes.includes(429), `spoofed XFF evaded the limiter: ${codes}`);
  a.close();
  const p = await listen(createApp({ db, mandate, paypal: null }, { rateLimitPerMin: 3, trustProxy: 1 }));
  const c2: number[] = [];
  for (let i = 0; i < 6; i++) c2.push((await fetch(p.base + '/v1/mandate', { headers: { 'x-forwarded-for': `10.0.0.${i}` } })).status);
  assert.ok(!c2.includes(429), 'behind a configured proxy, distinct client addresses are distinct');
  p.close();
});
