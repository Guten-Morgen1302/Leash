// Reserve-then-execute. check() is ONE BEGIN IMMEDIATE transaction: read window, read refundable balance, run the pure policy,
// reserve the amount (and item quantities) and append the ledger row. PayPal is called OUTSIDE the transaction.
// Live PayPal state (disputes, capture date) is read by the caller BEFORE check() and passed in as `ext`.
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { tx, type Db } from './db.ts';
import { decide, resolveItems, type ItemRow } from './policy.ts';
import { hashArgs, ledger, sha } from './ledger.ts';
import type { CheckInput, CheckResult, Decision, ExternalState, Mandate, PayRow } from './types.ts';

// statuses that SPEND the cap (blocked, denied, expired, failed and shadow do not)
const COUNTS = `('reserved','executed','approved_executed','unknown_outcome')`;
const DAY_MS = 86_400_000;

const payOf = (db: Db, cap: string): PayRow | undefined =>
  db.one<{ c: number; f: number; r: number; cur: string; capturedAt: number | null }>(
    'SELECT captured_cents c, refunded_cents f, reserved_cents r, currency cur, captured_at capturedAt FROM payments WHERE txn_id=?',
    cap,
  );

// rolling 24h total; EXCLUDES the action's own id (guard against double counting)
const windowSum = (db: Db, sid: string, now: number, exceptId: string): number =>
  db.val<number>(`SELECT COALESCE(SUM(amount_cents),0) FROM actions WHERE session_id=? AND created_at>=? AND id<>? AND status IN ${COUNTS}`, sid, now - DAY_MS, exceptId) ?? 0;

const isDup = (db: Db, sid: string, cap: string, cents: number, now: number, exceptId: string, win = DAY_MS): boolean =>
  win > 0 &&
  !!db.one(`SELECT 1 FROM actions WHERE session_id=? AND capture_id=? AND amount_cents=? AND created_at>=? AND id<>? AND status IN ${COUNTS}`, sid, cap, cents, now - win, exceptId);

const releaseItems = (db: Db, actionId: string, executed: boolean): void => {
  for (const it of db.all<{ order_id: string; item_id: string; qty: number }>('SELECT order_id, item_id, qty FROM action_items WHERE action_id=?', actionId)) {
    if (executed) db.run('UPDATE order_items SET reserved_qty=reserved_qty-?, refunded_qty=refunded_qty+? WHERE order_id=? AND item_id=?', it.qty, it.qty, it.order_id, it.item_id);
    else db.run('UPDATE order_items SET reserved_qty=reserved_qty-? WHERE order_id=? AND item_id=?', it.qty, it.order_id, it.item_id);
  }
};

export function check(db: Db, m: Mandate, a: CheckInput, now = Date.now(), ext?: ExternalState): CheckResult {
  return tx(db, () => {
    const prior = db.one<{ status: string; ruleId: string; reason: string }>('SELECT status, rule_id ruleId, reason FROM actions WHERE id=?', a.actionId);
    if (prior) {
      // a hook retry gets the same answer
      const status = prior.status === 'reserved' ? 'allowed' : prior.status === 'pending_approval' ? 'pending_approval' : 'blocked';
      return { status, ruleId: prior.ruleId, reason: prior.reason, actionId: a.actionId };
    }
    const pay = payOf(db, a.captureId);

    // ---- item-scoped path: the amount comes from trusted order data resolved by CAPTURE ID (agent-supplied order ids are never used)
    let amountCents = a.amountCents;
    let itemLines: { itemId: string; name: string; qty: number; cents: number }[] | undefined;
    let orderId: string | undefined;
    let fullOrder = false;
    if (a.items) {
      const order = db.one<{ order_id: string }>('SELECT order_id FROM orders WHERE capture_id=?', a.captureId);
      if (!order) {
        return finish(db, a, now, { status: 'blocked', ruleId: 'R-ITEMS-UNKNOWN', reason: 'No order data is known for that payment, so items cannot be priced.' }, 0, undefined, undefined, m);
      }
      orderId = order.order_id;
      const rows = db.all<ItemRow>('SELECT item_id, name, unit_cents, qty, refunded_qty, reserved_qty, refundable, flag FROM order_items WHERE order_id=?', orderId);
      const res = resolveItems(rows, a.items);
      if (!res.ok) return finish(db, a, now, res.decision, 0, undefined, undefined, m);
      amountCents = res.cents;
      itemLines = res.lines;
      fullOrder = res.fullOrder;
    }
    amountCents = amountCents ?? (pay ? pay.c - pay.f - pay.r : 0); // omitted amount = full remaining balance

    const argsHash = hashArgs(a.tool, a.captureId, amountCents, a.items);
    const grant = db.one<{ id: string }>('SELECT id FROM grants WHERE args_hash=? AND session_id=? AND used=0 AND expires_at>?', argsHash, a.sessionId, now);
    let d: Decision = decide({ amountCents, currency: a.currency }, m, {
      pay,
      windowSum: windowSum(db, a.sessionId, now, a.actionId),
      dup: isDup(db, a.sessionId, a.captureId, amountCents, now, a.actionId, m.dupWindowMs),
      now,
      approved: !!grant,
      ...(ext ? { ext } : {}),
    });
    // whole-order item refunds escalate (cumulative), unless already approved or the merchant turned the rule off
    if (d.status === 'allowed' && fullOrder && m.escalateFullOrder !== false && !grant)
      d = { status: 'pending_approval', ruleId: 'R-ITEMS-ALL', reason: 'This refund would take every item in the order, so a human must approve it.' };
    if (grant) db.run('UPDATE grants SET used=1 WHERE id=?', grant.id);
    return finish(db, a, now, d, amountCents, itemLines, orderId, m);
  });
}

/** Persist the decision. SHADOW mode records the would-have decision and never reserves, escalates or blocks. */
function finish(db: Db, a: CheckInput, now: number, d: Decision, amountCents: number, lines: { itemId: string; name: string; qty: number; cents: number }[] | undefined, orderId: string | undefined, m: Mandate): CheckResult {
  if (m.shadow) {
    db.run('INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,decision,rule_id,reason,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', a.actionId, a.sessionId, a.tool, a.captureId, amountCents, d.status, d.ruleId, d.reason, 'shadow', now, now);
    ledger(db, a.actionId, 'shadow', { wouldHave: d.status, ruleId: d.ruleId, amountCents, captureId: a.captureId, items: lines }, now);
    return { status: 'allowed', ruleId: 'R-SHADOW', reason: 'Shadow mode: recorded only, nothing was enforced.', actionId: a.actionId, shadow: true, wouldHave: d };
  }
  const status = d.status === 'allowed' ? 'reserved' : d.status === 'blocked' ? 'blocked' : 'pending_approval';
  db.run('INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,decision,rule_id,reason,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', a.actionId, a.sessionId, a.tool, a.captureId, amountCents, d.status, d.ruleId, d.reason, status, now, now);
  if (status === 'reserved') {
    db.run('UPDATE payments SET reserved_cents=reserved_cents+? WHERE txn_id=?', amountCents, a.captureId);
    if (lines && orderId)
      for (const l of lines) {
        db.run('UPDATE order_items SET reserved_qty=reserved_qty+? WHERE order_id=? AND item_id=?', l.qty, orderId, l.itemId);
        db.run('INSERT INTO action_items(action_id,order_id,item_id,qty) VALUES (?,?,?,?)', a.actionId, orderId, l.itemId, l.qty);
      }
  }
  let approvalUrl: string | undefined;
  let token: string | undefined;
  if (status === 'pending_approval') {
    token = randomBytes(16).toString('hex');
    db.run('INSERT INTO approvals(action_id, token_hash, expires_at, status) VALUES (?,?,?,?)', a.actionId, sha(token), now + 15 * 60_000, 'pending');
    if (lines && orderId) for (const l of lines) db.run('INSERT INTO action_items(action_id,order_id,item_id,qty) VALUES (?,?,?,?)', a.actionId, orderId, l.itemId, l.qty);
    approvalUrl = `${process.env.LEASH_PUBLIC_URL ?? 'http://127.0.0.1:4317'}/approve/${a.actionId}#t=${token}`; // token in the fragment: never sent to servers or logs
  }
  ledger(db, a.actionId, status, { ruleId: d.ruleId, amountCents, captureId: a.captureId, items: lines }, now);
  return { ...d, actionId: a.actionId, ...(approvalUrl ? { approvalUrl } : {}), ...(token ? { token } : {}) };
}

export type Outcome = 'executed' | 'failed' | 'unknown';

/** PostToolUse / proxy result. Release the reservation ONLY on a clear failure; ambiguity keeps it held (conservative). */
export function result(db: Db, i: { actionId: string; outcome: Outcome; refundId?: string | undefined }, now = Date.now()): void {
  tx(db, () => {
    const row = db.one<{ status: string; amt: number; cap: string }>('SELECT status, amount_cents amt, capture_id cap FROM actions WHERE id=?', i.actionId);
    if (!row || row.status !== 'reserved') return; // idempotent; blocked and escalated calls never executed
    if (i.outcome === 'executed') {
      db.run('UPDATE payments SET reserved_cents=reserved_cents-?, refunded_cents=refunded_cents+? WHERE txn_id=?', row.amt, row.amt, row.cap);
      releaseItems(db, i.actionId, true);
    }
    if (i.outcome === 'failed') {
      db.run('UPDATE payments SET reserved_cents=reserved_cents-? WHERE txn_id=?', row.amt, row.cap);
      releaseItems(db, i.actionId, false);
    }
    const status = i.outcome === 'executed' ? 'executed' : i.outcome === 'failed' ? 'execution_failed' : 'unknown_outcome';
    db.run('UPDATE actions SET status=?, updated_at=? WHERE id=?', status, now, i.actionId);
    ledger(db, i.actionId, status, { refundId: i.refundId ?? null }, now);
  });
}

/** Every 60 s: a result that never arrived becomes unknown_outcome. It still counts toward every cap and keeps its reservation. */
export function sweep(db: Db, now = Date.now()): void {
  tx(db, () => {
    for (const r of db.all<{ id: string }>(`SELECT id FROM actions WHERE status='reserved' AND updated_at < ?`, now - 120_000)) {
      db.run(`UPDATE actions SET status='unknown_outcome', updated_at=? WHERE id=?`, now, r.id);
      ledger(db, r.id, 'unknown_outcome', { reason: 'no result within 120s' }, now);
    }
  });
}

export type ApproveResult = { ok: true } | { ok: false; code: 403 | 404 | 409 | 410; why: string };

/** Approval executes NOTHING. It re-checks the hard rules against CURRENT state and mints a single-use 10-minute grant that the agent's retry consumes. */
export function approve(db: Db, m: Mandate, i: { actionId: string; token: string; decision: 'approve' | 'deny' }, now = Date.now(), ext?: ExternalState): ApproveResult {
  return tx(db, (): ApproveResult => {
    const row = db.one<any>(
      `SELECT a.session_id sid, a.tool, a.capture_id cap, a.amount_cents amt, a.status ast, ap.token_hash th, ap.expires_at exp, ap.status aps
       FROM approvals ap JOIN actions a ON a.id = ap.action_id WHERE ap.action_id = ?`,
      i.actionId,
    );
    if (!row) return { ok: false, code: 404, why: 'Unknown approval.' };
    const given = createHash('sha256').update(i.token).digest();
    const want = Buffer.from(row.th, 'hex');
    if (want.length !== given.length || !timingSafeEqual(given, want)) return { ok: false, code: 403, why: 'Invalid approval token.' };
    if (row.aps !== 'pending' || row.ast !== 'pending_approval') return { ok: false, code: 409, why: `Already ${row.aps}. Nothing more to do.` };
    if (now > row.exp) {
      db.run(`UPDATE approvals SET status='expired' WHERE action_id=?`, i.actionId);
      db.run(`UPDATE actions SET status='expired', updated_at=? WHERE id=?`, now, i.actionId);
      ledger(db, i.actionId, 'expired', {}, now);
      return { ok: false, code: 410, why: 'This approval expired. Nothing was refunded.' };
    }
    if (i.decision === 'deny') {
      db.run(`UPDATE approvals SET status='denied' WHERE action_id=?`, i.actionId);
      db.run(`UPDATE actions SET status='denied', updated_at=? WHERE id=?`, now, i.actionId);
      ledger(db, i.actionId, 'denied', {}, now);
      return { ok: true };
    }
    const items = db.all<{ item_id: string; qty: number }>('SELECT item_id, qty FROM action_items WHERE action_id=?', i.actionId).map((x) => ({ itemId: x.item_id, qty: x.qty }));
    const d = decide({ amountCents: row.amt }, m, {
      pay: payOf(db, row.cap),
      now,
      approved: true,
      windowSum: windowSum(db, row.sid, now, i.actionId),
      dup: isDup(db, row.sid, row.cap, row.amt, now, i.actionId, m.dupWindowMs),
      ...(ext ? { ext } : {}),
    });
    if (d.status !== 'allowed') {
      db.run(`UPDATE approvals SET status='rejected' WHERE action_id=?`, i.actionId);
      db.run(`UPDATE actions SET status='blocked', rule_id=?, reason=?, updated_at=? WHERE id=?`, d.ruleId, d.reason, now, i.actionId);
      ledger(db, i.actionId, 'approval_rejected', { ruleId: d.ruleId }, now);
      return { ok: false, code: 409, why: `No longer valid: ${d.reason}` };
    }
    db.run('INSERT INTO grants(id,args_hash,session_id,action_id,used,expires_at) VALUES (?,?,?,?,0,?)', randomUUID(), hashArgs(row.tool, row.cap, row.amt, items.length ? items : undefined), row.sid, i.actionId, now + 600_000);
    db.run(`UPDATE approvals SET status='approved' WHERE action_id=?`, i.actionId);
    db.run(`UPDATE actions SET status='approved', updated_at=? WHERE id=?`, now, i.actionId);
    ledger(db, i.actionId, 'approved', { ruleId: d.ruleId }, now);
    return { ok: true };
  });
}

/** Shadow-mode report: what Leash WOULD have stopped, in dollars, by rule. */
export function preventedLoss(db: Db): { wouldBlockCents: number; wouldEscalateCents: number; byRule: Record<string, number>; actions: number } {
  const rows = db.all<{ decision: string; rule_id: string; amount_cents: number }>(`SELECT decision, rule_id, amount_cents FROM actions WHERE status='shadow'`);
  const out = { wouldBlockCents: 0, wouldEscalateCents: 0, byRule: {} as Record<string, number>, actions: rows.length };
  for (const r of rows) {
    if (r.decision === 'blocked') out.wouldBlockCents += r.amount_cents;
    if (r.decision === 'pending_approval') out.wouldEscalateCents += r.amount_cents;
    if (r.decision !== 'allowed') out.byRule[r.rule_id] = (out.byRule[r.rule_id] ?? 0) + r.amount_cents;
  }
  return out;
}
