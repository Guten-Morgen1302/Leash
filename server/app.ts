// HTTP API (Express). One service: /v1/* here, the built SPA is served by index.ts in Phase 3. Fail closed everywhere.
import express, { type NextFunction, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { isBusy, LeashBusyError } from './db.ts';
import { approve, check, preventedLoss, result, sweep } from './dispatch.ts';
import { describeMandate } from './config.ts';
import { verifyChain } from './ledger.ts';
import { readState, runRefund, type GateDeps } from './gate.ts';
import { toCents } from './paypal.ts';
import { BOOT_ID, demoRouter, tickets } from './demo.ts';
import { aiSummary } from './llm.ts';
import { rateLimit } from './ratelimit.ts';
import { compilePolicy, FIELDS } from './compiler.ts';
import { askGemini } from './llm.ts';
import { readFileSync } from 'node:fs';

const eq = (a: string, b: string): boolean => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export interface AppOptions {
  token?: string | undefined; // LEASH_TOKEN; REQUIRED in production for the hook endpoints
  production?: boolean;
  trustProxy?: number | boolean; // number of proxy hops in front (LEASH_TRUST_PROXY); default none
  rateLimitPerMin?: number;
  demoRunsPerMin?: number;
  fetchImpl?: typeof fetch; // tests
  askImpl?: (prompt: string) => Promise<string>; // tests
  lockOperatorEndpoints?: boolean; // LEASH_LOCK_OPERATOR_ENDPOINTS=1: require the bearer token on /ledger and /exposure too.
  // Off by default so the public demo's own transparency feature (anyone can watch the hash chain) keeps working unauthenticated.
  // /approval/:id and POST /approve stay public regardless: that flow is designed for a human clicking an emailed link with no login,
  // and its secret is the per-action token, not a service-wide bearer.
}

export function createApp(d: GateDeps, o: AppOptions = {}): express.Express {
  const app = express();
  app.set('trust proxy', o.trustProxy ?? false); // only honor X-Forwarded-For when a proxy is configured: otherwise any client could pick its own rate-limit key
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  const summaries = new Map<string, string | null>(); // one Gemini call per approval, not one per page load
  const api = express.Router();
  api.use(rateLimit(o.rateLimitPerMin ?? 240));
  api.use('/demo/run', rateLimit(o.demoRunsPerMin ?? 30));
  // /v1/refund moves real (sandbox) money when PayPal credentials are present: same bearer token, and disabled (503) if none is configured
  api.use('/refund', (req: Request, res: Response, next: NextFunction) => {
    if (!d.paypal) return next();
    if (!o.token) return void res.status(503).json({ error: 'live refunds disabled: LEASH_TOKEN not set' });
    eq(req.get('authorization') ?? '', `Bearer ${o.token}`) ? next() : void res.status(401).json({ error: 'unauthorized' });
  });
  // hook endpoints: bearer token; FAIL CLOSED (503) if unset in production
  api.use(['/check', '/result'], (req: Request, res: Response, next: NextFunction) => {
    if (!o.token) return o.production ? void res.status(503).json({ error: 'hook endpoints disabled: LEASH_TOKEN not set' }) : next();
    eq(req.get('authorization') ?? '', `Bearer ${o.token}`) ? next() : void res.status(401).json({ error: 'unauthorized' });
  });
  // operator-facing read endpoints (full ledger, spend exposure): public by default for the demo's own transparency feature;
  // an operator running this beyond the demo can require the same bearer token here (LEASH_LOCK_OPERATOR_ENDPOINTS=1).
  api.use(['/ledger', '/exposure'], (req: Request, res: Response, next: NextFunction) => {
    if (!o.lockOperatorEndpoints) return next();
    if (!o.token) return void res.status(503).json({ error: 'operator endpoints locked: LEASH_TOKEN not set' });
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
    const rows = d.db.all('SELECT l.seq, l.action_id, l.event, l.hash, l.created_at, a.rule_id, a.amount_cents, a.decision FROM ledger l LEFT JOIN actions a ON a.id=l.action_id ORDER BY l.seq DESC LIMIT ? OFFSET ?', limit, offset);
    res.json({ rows, total: d.db.val<number>('SELECT COUNT(*) FROM ledger') ?? 0, chain: verifyChain(d.db), mode: d.paypal ? 'LIVE-FIRE' : 'SIMULATED' });
  });
  api.get('/mandate', (_req, res) => res.json({ lines: describeMandate(d.mandate), mandate: d.mandate }));
  api.get('/exposure', (req, res) => {
    const sid = String(req.query.sessionId ?? '');
    const spent = d.db.val<number>(`SELECT COALESCE(SUM(amount_cents),0) FROM actions WHERE session_id=? AND created_at>=? AND status IN ('reserved','executed','approved_executed','unknown_outcome')`, sid, Date.now() - 86_400_000) ?? 0;
    res.json({ spentCents: spent, hardDailyCapCents: d.mandate.hardDailyCapCents, ...preventedLoss(d.db) });
  });
  // AUTHOR step: plain-English policy -> DRAFT with plain-language playback. Never activates anything (activation is a deliberate CLI step that refuses while any field is null).
  const SAMPLES = ['coffee', 'apparel', 'handmade'];
  const playback = (f: Record<string, number | boolean | null>): string[] => {
    const usd = (c: unknown) => `$${(Number(c) / 100).toFixed(2)}`;
    const line = (k: string, text: (v: any) => string, name: string) => (f[k] == null ? `NOT SET: ${name}. Leash will not guess; answer this before activating.` : text(f[k]));
    return [
      line('perActionCapCents', (v) => `The agent may refund up to ${usd(v)} on its own.`, 'agent limit per refund'),
      line('hardMaxCents', (v) => `Nothing above ${usd(v)} is ever refunded, even with approval.`, 'absolute maximum refund'),
      line('dailyCapCents', (v) => `In 24 hours the agent alone may refund up to ${usd(v)}.`, 'daily limit'),
      line('hardDailyCapCents', (v) => `The absolute 24-hour limit is ${usd(v)}.`, 'absolute daily limit'),
      line('returnWindowDays', (v) => `Refunds are refused after ${v} days.`, 'return window'),
      line('blockIfOpenDispute', (v) => (v ? 'Refunds are refused while the payment has an open dispute.' : 'Open disputes do not block refunds.'), 'open-dispute rule'),
      line('escalateFullOrder', (v) => (v ? 'Refunding every item of an order needs a person.' : 'Full-order refunds do not need a person.'), 'full-order rule'),
    ];
  };
  const author = express.Router();
  author.get('/samples', (_q, res) => res.json({ samples: SAMPLES.map((n) => ({ id: n, policy: readFileSync(`server/fixtures/demo/policy-${n}.txt`, 'utf8') })), live: !!process.env.GEMINI_API_KEY }));
  author.post('/compile', rateLimit(5), async (req, res) => {
    const policy = typeof req.body?.policy === 'string' ? req.body.policy.slice(0, 4000) : '';
    const sample = typeof req.body?.sample === 'string' ? req.body.sample : '';
    if (!policy.trim() && !SAMPLES.includes(sample)) return void res.status(400).json({ error: 'invalid_input', fix: 'Send the policy text.' });
    let draft; let source = 'live';
    if (process.env.GEMINI_API_KEY && policy.trim()) draft = await compilePolicy(policy, (p) => (o.askImpl ?? askGemini)(p));
    else if (SAMPLES.includes(sample)) { draft = JSON.parse(readFileSync(`server/fixtures/demo/compile-${sample}.json`, 'utf8')); source = 'recorded'; }
    else return void res.status(503).json({ error: 'no_model', fix: 'Compiling your own text needs GEMINI_API_KEY on the server. Pick one of the sample policies to see a recorded compile.' });
    res.json({ source, runs: draft.runs, disagreements: draft.disagreements, fields: draft.fields, playback: playback(draft.fields), unsupported: draft.unsupported.slice(0, 40), questions: draft.questions.slice(0, 40), activatable: FIELDS.filter((k) => ['perActionCapCents', 'hardMaxCents', 'dailyCapCents', 'hardDailyCapCents'].includes(k)).every((k) => draft.fields[k] != null) });
  });
  api.use('/author', author);
  // recorded live-sandbox proof; re-read from PayPal when this server has sandbox credentials
  api.get('/proof', async (_req, res) => {
    const rec = JSON.parse(readFileSync('server/fixtures/demo/live-sandbox.json', 'utf8'));
    const refunds = await Promise.all(rec.refunds.map(async (r: any) => {
      if (!d.paypal) return { ...r, live: null };
      try { const g = await d.paypal.getRefund(r.refund_id); return { ...r, live: { status: g.status, amount: g.amount?.value } }; } catch { return { ...r, live: { status: 'unavailable' } }; }
    }));
    res.json({ note: rec.note, mode: d.paypal ? 'LIVE-FIRE' : 'SIMULATED', refunds });
  });
  api.use('/demo', demoRouter(d));
  // read-only data for the approval page (the token is never needed or returned here)
  api.get('/approval/:id', async (req, res) => {
    const a = d.db.one<any>('SELECT a.id, a.amount_cents, a.rule_id, a.reason, a.status, ap.expires_at, ap.status aps FROM actions a JOIN approvals ap ON ap.action_id=a.id WHERE a.id=?', req.params.id);
    if (!a) return void res.status(404).json({ error: 'unknown_approval', bootId: BOOT_ID, why: 'This demo was reset after a server restart, or the link is wrong.' });
    const items = d.db.all<any>('SELECT oi.name, oi.unit_cents, ai.qty FROM action_items ai JOIN order_items oi ON oi.order_id=ai.order_id AND oi.item_id=ai.item_id WHERE ai.action_id=?', a.id);
    let ai = summaries.get(a.id);
    if (ai === undefined) { ai = await aiSummary({ amountCents: a.amount_cents, ruleId: a.rule_id, ticket: tickets.get(a.id) ?? '' }, o.fetchImpl); if (ai) summaries.set(a.id, ai); }
    res.json({ aiGenerated: !!ai, actionId: a.id, amountCents: a.amount_cents, ruleId: a.rule_id, reason: a.reason, status: a.aps === 'pending' && Date.now() > a.expires_at ? 'expired' : a.aps, expiresAt: a.expires_at, items, bootId: BOOT_ID,
      summary: ai ?? `Advisory summary: the agent asks to refund ${items.map((i: any) => `${i.qty} x ${i.name}`).join(', ') || 'a payment'} ($${(a.amount_cents / 100).toFixed(2)}). That is above the $${(d.mandate.perActionCapCents / 100).toFixed(2)} the agent may refund alone, so it waits for you.` });
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
