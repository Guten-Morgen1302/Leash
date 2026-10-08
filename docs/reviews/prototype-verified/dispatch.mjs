// Faithful JS port of the designed dispatch.ts incl. Hardening Addendum (verification harness, not repo code)
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { tx } from './db.mjs';

const COUNTS = `('reserved','executed','approved_executed','unknown_outcome')`;
const usd = (c) => `$${(c / 100).toFixed(2)}`;
export const canon = (v) => JSON.stringify(v, (_, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x);
const sha = (s) => createHash('sha256').update(s).digest('hex');
export const hashArgs = (tool, cap, cents) => sha(canon({ tool, cap, cents }));

export function ledger(db, actionId, event, payload, ts) {
  const prev = db.val('SELECT hash FROM ledger ORDER BY seq DESC LIMIT 1') ?? '0'.repeat(64);
  const hash = sha(prev + canon({ actionId, event, payload, ts }));
  db.run('INSERT INTO ledger(action_id,event,payload_json,prev_hash,hash,created_at) VALUES (?,?,?,?,?,?)', actionId, event, canon(payload), prev, hash, ts);
}
export function verifyChain(db) {
  let prev = '0'.repeat(64), n = 0;
  for (const r of db.all('SELECT * FROM ledger ORDER BY seq')) {
    const want = sha(prev + canon({ actionId: r.action_id, event: r.event, payload: JSON.parse(r.payload_json), ts: r.created_at }));
    if (r.prev_hash !== prev || r.hash !== want) return { ok: false, brokenAt: r.seq };
    prev = r.hash; n++;
  }
  return { ok: true, rows: n, head: prev };
}

export function decide(a, m, s) {
  const r = (status, ruleId, reason) => ({ status, ruleId, reason });
  if (s.now > m.expiresAt) return r('blocked', 'R-MANDATE-EXPIRED', 'The mandate has expired.');
  if (!Number.isInteger(a.amountCents) || a.amountCents <= 0) return r('blocked', 'R-INVALID', 'Refund amount must be a positive number.');
  if (!s.pay) return r('blocked', 'R-UNKNOWN-TXN', 'That payment is not known to Leash.');
  if (a.currency && s.pay.cur && a.currency !== s.pay.cur) return r('blocked', 'R-CURRENCY', `Refund currency ${a.currency} differs from the capture's ${s.pay.cur}.`);
  const left = s.pay.c - s.pay.f - s.pay.r;
  if (a.amountCents > left) return r('blocked', 'R-OVER-CAPTURE', `Refund ${usd(a.amountCents)} exceeds the ${usd(left)} still refundable of ${usd(s.pay.c)} captured.`);
  if (s.dup) return r('blocked', 'R-DUP', 'An identical refund was already allowed in the last 24 hours.');
  if (a.amountCents > m.hardMaxCents) return r('blocked', 'R-HARD-MAX', `Refund ${usd(a.amountCents)} is above the ${usd(m.hardMaxCents)} hard limit.`);
  if (s.windowSum + a.amountCents > m.hardDailyCapCents) return r('blocked', 'R-DAILY-HARD', `Refunds today would pass the ${usd(m.hardDailyCapCents)} hard daily limit.`);
  if (s.approved) return r('allowed', 'R-APPROVED', 'A human approved this exact refund.');
  if (s.windowSum + a.amountCents > m.dailyCapCents) return r('pending_approval', 'R-DAILY-CAP', `This would take today's refunds past ${usd(m.dailyCapCents)}.`);
  if (a.amountCents > m.perActionCapCents) return r('pending_approval', 'R-ACTION-CAP', `Refund ${usd(a.amountCents)} is above the ${usd(m.perActionCapCents)} auto-approve limit.`);
  return r('allowed', 'R-ALLOW', 'Within the mandate.');
}

const payOf = (db, cap) => db.one('SELECT captured_cents c, refunded_cents f, reserved_cents r, currency cur FROM payments WHERE txn_id=?', cap);
const windowSum = (db, sid, now, exceptId) => db.val(`SELECT COALESCE(SUM(amount_cents),0) FROM actions WHERE session_id=? AND created_at>=? AND id<>? AND status IN ${COUNTS}`, sid, now - 864e5, exceptId);
const isDup = (db, sid, cap, cents, now, exceptId, win = 864e5) => win > 0 && !!db.one(`SELECT 1 FROM actions WHERE session_id=? AND capture_id=? AND amount_cents=? AND created_at>=? AND id<>? AND status IN ${COUNTS}`, sid, cap, cents, now - win, exceptId);

export function check(db, m, a, now = Date.now()) {
  return tx(db, () => {
    const prior = db.one('SELECT status, rule_id ruleId, reason FROM actions WHERE id=?', a.actionId);
    if (prior) return { status: prior.status === 'reserved' ? 'allowed' : prior.status === 'pending_approval' ? 'pending_approval' : 'blocked', ruleId: prior.ruleId, reason: prior.reason, actionId: a.actionId };
    const pay = payOf(db, a.captureId);
    const amountCents = a.amountCents ?? (pay ? pay.c - pay.f - pay.r : 0);
    const argsHash = hashArgs(a.tool, a.captureId, amountCents);
    const grant = db.one('SELECT id FROM grants WHERE args_hash=? AND session_id=? AND used=0 AND expires_at>?', argsHash, a.sessionId, now);
    const d = decide({ amountCents, currency: a.currency }, m, { pay, windowSum: windowSum(db, a.sessionId, now, a.actionId), dup: isDup(db, a.sessionId, a.captureId, amountCents, now, a.actionId, m.dupWindowMs), now, approved: !!grant });
    if (grant) db.run('UPDATE grants SET used=1 WHERE id=?', grant.id);
    const status = d.status === 'allowed' ? 'reserved' : d.status === 'blocked' ? 'blocked' : 'pending_approval';
    db.run('INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,decision,rule_id,reason,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', a.actionId, a.sessionId, a.tool, a.captureId, amountCents, d.status, d.ruleId, d.reason, status, now, now);
    if (status === 'reserved') db.run('UPDATE payments SET reserved_cents=reserved_cents+? WHERE txn_id=?', amountCents, a.captureId);
    let approvalUrl, token;
    if (status === 'pending_approval') {                                   // GAP FOUND WHILE PORTING: the earlier snippet never created the approvals row
      token = randomBytes(16).toString('hex');
      db.run('INSERT INTO approvals(action_id, token_hash, expires_at, status) VALUES (?,?,?,?)', a.actionId, sha(token), now + 15 * 60_000, 'pending');
      approvalUrl = `http://127.0.0.1:4317/approve/${a.actionId}#t=${token}`;   // token in the fragment: never sent to servers or logs
    }
    ledger(db, a.actionId, status, { ruleId: d.ruleId, amountCents, captureId: a.captureId }, now);
    return { ...d, actionId: a.actionId, approvalUrl, token };
  });
}

export function result(db, i, now = Date.now()) {
  tx(db, () => {
    const row = db.one('SELECT status, amount_cents amt, capture_id cap FROM actions WHERE id=?', i.actionId);
    if (!row || row.status !== 'reserved') return;
    if (i.outcome === 'executed') db.run('UPDATE payments SET reserved_cents=reserved_cents-?, refunded_cents=refunded_cents+? WHERE txn_id=?', row.amt, row.amt, row.cap);
    if (i.outcome === 'failed') db.run('UPDATE payments SET reserved_cents=reserved_cents-? WHERE txn_id=?', row.amt, row.cap);
    const status = i.outcome === 'executed' ? 'executed' : i.outcome === 'failed' ? 'execution_failed' : 'unknown_outcome';
    db.run('UPDATE actions SET status=?, updated_at=? WHERE id=?', status, now, i.actionId);
    ledger(db, i.actionId, status, { refundId: i.refundId ?? null }, now);
  });
}

export function sweep(db, now = Date.now()) {
  tx(db, () => {
    for (const r of db.all(`SELECT id FROM actions WHERE status='reserved' AND updated_at < ?`, now - 120_000)) {
      db.run(`UPDATE actions SET status='unknown_outcome', updated_at=? WHERE id=?`, now, r.id);
      ledger(db, r.id, 'unknown_outcome', { reason: 'no result within 120s' }, now);
    }
  });
}

export function approve(db, m, i, now = Date.now()) {
  return tx(db, () => {
    const row = db.one(`SELECT a.session_id sid, a.tool, a.capture_id cap, a.amount_cents amt, a.status ast, ap.token_hash th, ap.expires_at exp, ap.status aps FROM approvals ap JOIN actions a ON a.id = ap.action_id WHERE ap.action_id = ?`, i.actionId);
    if (!row) return { ok: false, code: 404, why: 'Unknown approval.' };
    const given = createHash('sha256').update(i.token).digest(), want = Buffer.from(row.th, 'hex');
    if (want.length !== given.length || !timingSafeEqual(given, want)) return { ok: false, code: 403, why: 'Invalid approval token.' };
    if (row.aps !== 'pending' || row.ast !== 'pending_approval') return { ok: false, code: 409, why: `Already ${row.aps}. Nothing more to do.` };
    if (now > row.exp) {
      db.run(`UPDATE approvals SET status='expired' WHERE action_id=?`, i.actionId); db.run(`UPDATE actions SET status='expired', updated_at=? WHERE id=?`, now, i.actionId);
      ledger(db, i.actionId, 'expired', {}, now); return { ok: false, code: 410, why: 'This approval expired. Nothing was refunded.' };
    }
    if (i.decision === 'deny') {
      db.run(`UPDATE approvals SET status='denied' WHERE action_id=?`, i.actionId); db.run(`UPDATE actions SET status='denied', updated_at=? WHERE id=?`, now, i.actionId);
      ledger(db, i.actionId, 'denied', {}, now); return { ok: true };
    }
    const pay = payOf(db, row.cap);
    const d = decide({ amountCents: row.amt }, m, { pay, now, approved: true, windowSum: windowSum(db, row.sid, now, i.actionId), dup: isDup(db, row.sid, row.cap, row.amt, now, i.actionId, m.dupWindowMs) });
    if (d.status !== 'allowed') {
      db.run(`UPDATE approvals SET status='rejected' WHERE action_id=?`, i.actionId); db.run(`UPDATE actions SET status='blocked', rule_id=?, reason=?, updated_at=? WHERE id=?`, d.ruleId, d.reason, now, i.actionId);
      ledger(db, i.actionId, 'approval_rejected', { ruleId: d.ruleId }, now); return { ok: false, code: 409, why: `No longer valid: ${d.reason}` };
    }
    db.run('INSERT INTO grants(id,args_hash,session_id,action_id,used,expires_at) VALUES (?,?,?,?,0,?)', randomUUID(), hashArgs(row.tool, row.cap, row.amt), row.sid, i.actionId, now + 600_000);
    db.run(`UPDATE approvals SET status='approved' WHERE action_id=?`, i.actionId); db.run(`UPDATE actions SET status='approved', updated_at=? WHERE id=?`, now, i.actionId);
    ledger(db, i.actionId, 'approved', { ruleId: d.ruleId }, now); return { ok: true };
  });
}
