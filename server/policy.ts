// The policy engine: a PURE function. Limits are data (Mandate), state is passed in, nothing here does I/O.
// Rule order is the contract in docs/Backend/POLICY_REFERENCE.md. Hard rules (blocks) are re-checked even after human approval;
// approval waives only the soft rules (daily cap, action cap, state-unavailable).
import type { Decision, ExternalState, Mandate, PayRow } from './types.ts';

export const usd = (c: number): string => `$${(c / 100).toFixed(2)}`;
const DAY_MS = 86_400_000;

export interface PolicyState {
  pay: PayRow | undefined;
  windowSum: number;
  dup: boolean;
  now: number;
  approved?: boolean;
  ext?: ExternalState;
}

const r = (status: Decision['status'], ruleId: string, reason: string): Decision => ({ status, ruleId, reason });

export function decide(a: { amountCents: number; currency?: string | undefined }, m: Mandate, s: PolicyState): Decision {
  if (s.now > m.expiresAt) return r('blocked', 'R-MANDATE-EXPIRED', 'The mandate has expired.');
  if (!Number.isInteger(a.amountCents) || a.amountCents <= 0)
    return r('blocked', 'R-INVALID', 'Refund amount must be a positive number.');
  if (!s.pay) return r('blocked', 'R-UNKNOWN-TXN', 'That payment is not known to Leash.');
  if (a.currency && s.pay.cur && a.currency !== s.pay.cur)
    return r('blocked', 'R-CURRENCY', `Refund currency ${a.currency} differs from the capture's ${s.pay.cur}.`);
  const left = s.pay.c - s.pay.f - s.pay.r; // captured - refunded - RESERVED (closes the per-capture race)
  if (a.amountCents > left)
    return r('blocked', 'R-OVER-CAPTURE', `Refund ${usd(a.amountCents)} exceeds the ${usd(left)} still refundable of ${usd(s.pay.c)} captured.`);
  if (s.dup) return r('blocked', 'R-DUP', 'An identical refund was already allowed inside the duplicate window.');

  // PayPal-state rules (hard). ext.disputeOpen === true is a known fact; null means the lookup failed (soft rule below).
  if (m.blockIfOpenDispute && s.ext?.disputeOpen === true)
    return r('blocked', 'R-DISPUTE-OPEN', 'This payment has an open PayPal dispute, so a refund could pay the customer twice. Let the dispute finish.');
  const capturedAt = s.ext?.capturedAtMs ?? s.pay.capturedAt ?? null;
  if (m.returnWindowDays != null && capturedAt != null) {
    const ageDays = (s.now - capturedAt) / DAY_MS;
    if (ageDays > m.returnWindowDays)
      return r('blocked', 'R-WINDOW', `This payment is ${Math.floor(ageDays)} days old, outside the ${m.returnWindowDays}-day return window.`);
  }

  if (a.amountCents > m.hardMaxCents)
    return r('blocked', 'R-HARD-MAX', `Refund ${usd(a.amountCents)} is above the ${usd(m.hardMaxCents)} hard limit.`);
  if (s.windowSum + a.amountCents > m.hardDailyCapCents)
    return r('blocked', 'R-DAILY-HARD', `Refunds today would pass the ${usd(m.hardDailyCapCents)} hard daily limit.`);

  if (s.approved) return r('allowed', 'R-APPROVED', 'A human approved this exact refund.'); // waives ONLY the soft rules below

  const needsDispute = !!m.blockIfOpenDispute && s.ext?.disputeOpen == null;
  const needsAge = m.returnWindowDays != null && capturedAt == null;
  if (needsDispute || needsAge)
    return r('pending_approval', 'R-STATE-UNAVAILABLE', 'Leash could not read the payment\'s live PayPal state (dispute or purchase date), so a human must decide.');
  if (s.windowSum + a.amountCents > m.dailyCapCents)
    return r('pending_approval', 'R-DAILY-CAP', `This would take today's refunds past ${usd(m.dailyCapCents)}.`);
  if (a.amountCents > m.perActionCapCents)
    return r('pending_approval', 'R-ACTION-CAP', `Refund ${usd(a.amountCents)} is above the ${usd(m.perActionCapCents)} auto-approve limit.`);
  return r('allowed', 'R-ALLOW', 'Within the mandate.');
}

// ---- item-scoped refunds: the agent names items; the amount is computed from trusted order data ----
export interface ItemRow {
  item_id: string;
  name: string;
  unit_cents: number;
  qty: number;
  refunded_qty: number;
  reserved_qty: number;
  refundable: number;
  flag: string | null;
}

export type ItemResolution =
  | { ok: true; cents: number; lines: { itemId: string; name: string; qty: number; cents: number }[]; fullOrder: boolean }
  | { ok: false; decision: Decision };

export function resolveItems(orderItems: ItemRow[], wanted: { itemId: string; qty: number }[]): ItemResolution {
  const byId = new Map(orderItems.map((i) => [i.item_id, i]));
  const merged = new Map<string, number>();
  for (const w of wanted) {
    if (!Number.isInteger(w.qty) || w.qty < 1) return { ok: false, decision: r('blocked', 'R-ITEMS-UNKNOWN', 'Item quantities must be whole numbers of at least 1.') };
    merged.set(w.itemId, (merged.get(w.itemId) ?? 0) + w.qty);
  }
  if (merged.size === 0) return { ok: false, decision: r('blocked', 'R-ITEMS-UNKNOWN', 'Name at least one item to refund.') };
  const lines: { itemId: string; name: string; qty: number; cents: number }[] = [];
  let cents = 0;
  for (const [itemId, qty] of merged) {
    const it = byId.get(itemId);
    if (!it) return { ok: false, decision: r('blocked', 'R-ITEMS-UNKNOWN', `Item "${itemId}" is not part of this order.`) };
    if (!it.refundable) return { ok: false, decision: r('blocked', 'R-ITEM-NONREFUNDABLE', `"${it.name}" is not refundable under the merchant's policy${it.flag ? ` (${it.flag})` : ''}.`) };
    const free = it.qty - it.refunded_qty - it.reserved_qty;
    if (qty > free) return { ok: false, decision: r('blocked', 'R-ITEMS-REFUNDED', `Only ${Math.max(free, 0)} of "${it.name}" can still be refunded.`) };
    const c = it.unit_cents * qty;
    lines.push({ itemId, name: it.name, qty, cents: c });
    cents += c;
  }
  // CUMULATIVE full-order test: after this refund every unit of every item is refunded or reserved.
  // Splitting a whole-order refund across several calls therefore cannot dodge escalation.
  const fullOrder = orderItems.every((i) => i.refunded_qty + i.reserved_qty + (merged.get(i.item_id) ?? 0) >= i.qty);
  return { ok: true, cents, lines, fullOrder };
}
