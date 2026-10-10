// HTTP API (Express). One service: /v1/* here, the built SPA is served by index.ts in Phase 3. Fail closed everywhere.
import express, { type NextFunction, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { isBusy, LeashBusyError } from './db.ts';
import { approve, check, preventedLoss, result, sweep } from './dispatch.ts';
import { describeMandate } from './config.ts';
import { verifyChain } from './ledger.ts';
import { readState, runRefund, type GateDeps } from './gate.ts';
import { toCents } from './paypal.ts';

const eq = (a: string, b: string): boolean => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export interface AppOptions {
  token?: string | undefined; // LEASH_TOKEN; REQUIRED in production for the hook endpoints
  production?: boolean;
}

export function createApp(d: GateDeps, o: AppOptions = {}): express.Express {
  const app = express();
  app.set('trust proxy', 1); // per-IP limits key on the real client behind a proxy
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  const api = express.Router();
  // hook endpoints: bearer token; FAIL CLOSED (503) if unset in production
  api.use(['/check', '/result'], (req: Request, res: Response, next: NextFunction) => {
    if (!o.token) return o.production ? void res.status(503).json({ error: 'hook endpoints disabled: LEASH_TOKEN not set' }) : next();
    eq(req.get('authorization') ?? '', `Bearer ${o.token}`) ? next() : void res.status(401).json({ error: 'unauthorized' });
  });

  const cents = (v: unknown): number | null | typeof NaN => (v === null || v === undefined ? null : Number.isInteger(v) && (v as number) >= 0 ? (v as number) : NaN);

  // Hook path: the agent's own PayPal tool is gated; Leash decides and reserves, the hook allows or blocks.
  api.post('/check', async (req, res) => {
    const b = req.body ?? {};
    const c = cents(b.amountCents);
    if (typeof b.actionId !== 'string' || typeof b.sessionId !== 'string' || typeof b.captureId !== 'string' || !['refund', 'refund_items'].includes(b.tool) || Number.isNaN(c))
      return void res.status(400).json({ error: 'invalid_input', fix: 'Send actionId, sessionId, tool ("refund" or "refund_items"), captureId, integer amountCents or null.' });
    const ext = await readState(d, b.captureId);
    res.json(check(d.db, d.mandate, { actionId: b.actionId, sessionId: b.sessionId, tool: b.tool, captureId: b.captureId, amountCents: c as number | null, ...(typeof b.currency === 'string' ? { currency: b.currency } : {}), ...(Array.isArray(b.items) ? { items: b.items } : {}) }, Date.now(), ext));
  });
  api.post('/result', (req, res) => {
    const b = req.body ?? {};
    if (typeof b.actionId !== 'string' || !['executed', 'failed', 'unknown'].includes(b.outcome)) return void res.status(400).json({ error: 'invalid_input' });
    result(d.db, { actionId: b.actionId, outcome: b.outcome, refundId: typeof b.refundId === 'string' ? b.refundId : undefined });
    res.json({ ok: true });
  });

  // Direct path (demo UI, sim mode): the full pipeline including the execute step.
  api.post('/refund', async (req, res) => {
    const b = req.body ?? {};
    if (typeof b.captureId !== 'string' || typeof b.sessionId !== 'string') return void res.status(400).json({ error: 'invalid_input' });
    const items = Array.isArray(b.items) ? b.items.map((i: any) => ({ itemId: String(i.itemId), qty: Number(i.qty ?? 1) })) : undefined;
    const amt = typeof b.amount === 'string' ? toCents(b.amount) : null;
    res.json(await runRefund(d, { sessionId: b.sessionId, tool: items ? 'refund_items' : 'refund', captureId: b.captureId, amountCents: amt, ...(items ? { items } : {}) }));
  });

  // POST only: GET /approve/:id in the SPA renders the page and changes nothing
  api.post('/approve', (req, res) => {
    const b = req.body ?? {};
    const r = approve(d.db, d.mandate, { actionId: String(b.actionId), token: String(b.token ?? ''), decision: b.decision === 'deny' ? 'deny' : 'approve' });
    res.status(r.ok ? 200 : r.code).json(r);
  });

  api.get('/ledger', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
    const rows = d.db.all('SELECT l.seq, l.action_id, l.event, l.payload_json, l.hash, l.created_at, a.rule_id, a.amount_cents, a.decision FROM ledger l LEFT JOIN actions a ON a.id=l.action_id ORDER BY l.seq DESC LIMIT ? OFFSET ?', limit, offset);
    res.json({ rows, total: d.db.val<number>('SELECT COUNT(*) FROM ledger') ?? 0, chain: verifyChain(d.db), mode: d.paypal ? 'LIVE-FIRE' : 'SIMULATED' });
  });
  api.get('/mandate', (_req, res) => res.json({ lines: describeMandate(d.mandate), mandate: d.mandate }));
  api.get('/exposure', (req, res) => {
    const sid = String(req.query.sessionId ?? '');
    const spent = d.db.val<number>(`SELECT COALESCE(SUM(amount_cents),0) FROM actions WHERE session_id=? AND created_at>=? AND status IN ('reserved','executed','approved_executed','unknown_outcome')`, sid, Date.now() - 86_400_000) ?? 0;
    res.json({ spentCents: spent, hardDailyCapCents: d.mandate.hardDailyCapCents, ...preventedLoss(d.db) });
  });
  api.use((_req, res) => void res.status(404).json({ error: 'not_found' })); // an unknown /v1 path must never fall through to the SPA
  app.use('/v1', api);
  app.get('/health', (_req, res) => void res.json({ ok: true, mode: d.paypal ? 'live' : 'sim' }));

  app.use((e: any, _req: Request, res: Response, _next: NextFunction) => {
    if (e instanceof LeashBusyError || isBusy(e)) return void res.status(503).set('Retry-After', '1').json({ error: 'busy', fix: 'Retry in a moment.' });
    if (e?.type === 'entity.too.large' || e?.status === 400) return void res.status(400).json({ error: 'bad_request' });
    console.error('unhandled', e?.code ?? e?.name, e?.message);
    res.status(500).json({ error: 'internal' });
  });
  return app;
}

export { sweep };
