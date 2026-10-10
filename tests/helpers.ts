import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';

export const DAY = 86_400_000;
export const MANDATE_JSON = { schema_version: 1, perActionCapCents: 5000, hardMaxCents: 10000, dailyCapCents: 20000, hardDailyCapCents: 40000, expiresAt: '2099-01-01T00:00:00Z', returnWindowDays: 30, blockIfOpenDispute: true };

export async function tempDb(): Promise<{ db: Db; path: string }> {
  const path = join(mkdtempSync(join(tmpdir(), 'leash-')), 't.db');
  const db = await openDb(path);
  applySchema(db);
  return { db, path };
}

/** a $200 order of 5 items paid by capture `cap` (the same catalog used by the benchmark) */
export function seedOrder(db: Db, cap: string, capturedAt: number | null = Date.now() - 2 * DAY): void {
  db.run(`INSERT INTO payments(txn_id,captured_cents,currency,source,captured_at) VALUES (?,?,?,?,?)`, cap, 20000, 'USD', 'test', capturedAt);
  db.run(`INSERT INTO orders(order_id,capture_id) VALUES (?,?)`, 'ORD-' + cap, cap);
  const items: [string, string, number][] = [['mug', 'Ceramic mug', 1800], ['cushion', 'Cushion', 4200], ['lamp', 'Desk lamp', 5500], ['towels', 'Towel set', 3500], ['vase', 'Vase', 5000]];
  for (const [id, name, cents] of items) db.run(`INSERT INTO order_items(order_id,item_id,name,unit_cents,qty) VALUES (?,?,?,?,1)`, 'ORD-' + cap, id, name, cents);
}

/** A fake PayPal HTTP server. Records every call. mode controls refund behaviour. */
import http from 'node:http';
export interface FakePayPal { url: string; calls: { method: string; url: string; auth?: string | undefined; rid?: string | undefined; body: string }[]; setMode(m: string): void; setDisputes(items: object[]): void; close(): Promise<void> }
export async function fakePayPal(token = 'TEST-TOKEN-abc123', capturedIso = new Date(Date.now() - 2 * DAY).toISOString()): Promise<FakePayPal> {
  const calls: FakePayPal['calls'] = [];
  let mode = 'ok';
  let disputes: object[] = [];
  let n = 0;
  const srv = http.createServer((req, res) => {
    let b = '';
    req.on('data', (d) => (b += d)).on('end', () => {
      calls.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, rid: req.headers['paypal-request-id'] as string | undefined, body: b });
      const send = (code: number, o: object) => { res.writeHead(code, { 'content-type': 'application/json', 'paypal-debug-id': 'dbg123' }); res.end(JSON.stringify(o)); };
      if (req.url === '/v1/oauth2/token') return send(200, { access_token: token, expires_in: 32400 });
      if (mode === 'hang' && req.url!.includes('/refund')) return;
      if (mode === 'expire-once' && req.headers.authorization !== `Bearer ${token}-new`) { mode = 'ok'; return send(401, { name: 'AUTHENTICATION_FAILURE' }); }
      if (req.url!.startsWith('/v1/customer/disputes')) return send(200, { items: disputes });
      if (req.method === 'GET' && req.url!.startsWith('/v2/payments/captures/')) return send(200, { id: 'X', create_time: capturedIso, status: 'COMPLETED' });
      if (req.method === 'POST' && req.url!.endsWith('/refund')) {
        if (mode === '422') return send(422, { name: 'UNPROCESSABLE_ENTITY', message: `bad ${token}`, details: [{ issue: 'REFUND_AMOUNT_EXCEEDED' }] });
        if (mode === '500') return send(500, {});
        return send(201, { id: `REFUND${++n}ABCDEFGH`, status: 'COMPLETED' });
      }
      if (req.method === 'GET' && req.url!.startsWith('/v2/payments/refunds/')) return send(200, { id: 'R', status: 'COMPLETED', amount: { value: '18.00', currency_code: 'USD' } });
      send(404, {});
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(srv.address() as any).port}`, calls, setMode: (m) => (mode = m), setDisputes: (d) => (disputes = d), close: () => new Promise<void>((r) => { (srv as any).closeAllConnections?.(); srv.close(() => r()); }) };
}
