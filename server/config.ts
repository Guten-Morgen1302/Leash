// Mandate loading. Limits are DATA (docs/Product/IMPACT_AND_EVIDENCE.md "policy is data"). A null or missing required field makes the mandate INVALID:
// there are no silent defaults for an unclear field (decision D-V2-8).
import { readFileSync } from 'node:fs';
import type { Mandate } from './types.ts';

export class MandateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MandateError';
  }
}

const REQUIRED_INT = ['perActionCapCents', 'hardMaxCents', 'dailyCapCents', 'hardDailyCapCents'] as const;
const KNOWN = new Set<string>([...REQUIRED_INT, 'schema_version', 'expiresAt', 'dupWindowMs', 'returnWindowDays', 'blockIfOpenDispute', 'escalateFullOrder', 'shadow', 'description']);

export function parseMandate(raw: unknown): Mandate {
  if (!raw || typeof raw !== 'object') throw new MandateError('Mandate must be a JSON object.');
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 1) throw new MandateError(`mandate.json schema_version ${String(o.schema_version)} is not supported; this build expects 1. See docs/Backend/POLICY_REFERENCE.md.`);
  for (const k of Object.keys(o)) if (!KNOWN.has(k)) throw new MandateError(`Unknown mandate field "${k}" (the schema is a fixed whitelist).`);
  for (const k of REQUIRED_INT) {
    const v = o[k];
    if (v === null || v === undefined) throw new MandateError(`Mandate field ${k} is unset. Leash does not guess limits: answer it before activating the mandate.`);
    if (!Number.isInteger(v) || (v as number) <= 0) throw new MandateError(`Mandate field ${k} must be a positive integer number of cents.`);
  }
  const m = o as any;
  if (m.hardMaxCents < m.perActionCapCents) throw new MandateError('hardMaxCents must be at least perActionCapCents.');
  if (m.hardDailyCapCents < m.dailyCapCents) throw new MandateError('hardDailyCapCents must be at least dailyCapCents.');
  const exp = typeof o.expiresAt === 'string' ? Date.parse(o.expiresAt) : NaN;
  if (!Number.isFinite(exp)) throw new MandateError('Mandate field expiresAt must be an ISO date string.');
  if (o.returnWindowDays != null && (!Number.isInteger(o.returnWindowDays) || (o.returnWindowDays as number) <= 0)) throw new MandateError('returnWindowDays must be a positive whole number of days, or omitted.');
  for (const b of ['blockIfOpenDispute', 'escalateFullOrder', 'shadow'] as const) if (o[b] !== undefined && typeof o[b] !== 'boolean') throw new MandateError(`${b} must be true or false.`);
  if (o.dupWindowMs !== undefined && (!Number.isInteger(o.dupWindowMs) || (o.dupWindowMs as number) < 0)) throw new MandateError('dupWindowMs must be a whole number of milliseconds (0 disables the rule).');
  const out: Mandate = {
    perActionCapCents: m.perActionCapCents, hardMaxCents: m.hardMaxCents, dailyCapCents: m.dailyCapCents, hardDailyCapCents: m.hardDailyCapCents, expiresAt: exp,
    ...(m.dupWindowMs !== undefined ? { dupWindowMs: m.dupWindowMs } : {}),
    ...(m.returnWindowDays != null ? { returnWindowDays: m.returnWindowDays } : {}),
    ...(m.blockIfOpenDispute !== undefined ? { blockIfOpenDispute: m.blockIfOpenDispute } : {}),
    ...(m.escalateFullOrder !== undefined ? { escalateFullOrder: m.escalateFullOrder } : {}),
    ...(m.shadow !== undefined ? { shadow: m.shadow } : {}),
  };
  return out;
}

export function loadMandate(path: string): Mandate {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e: any) {
    throw new MandateError(`Cannot read mandate file ${path} (${e?.code ?? e?.message}). Set LEASH_MANDATE to its path.`);
  }
  try {
    return parseMandate(JSON.parse(text));
  } catch (e) {
    if (e instanceof MandateError) throw e;
    throw new MandateError(`Mandate file ${path} is not valid JSON.`);
  }
}

/** Plain-language rendering for the merchant (/mandate page). Every field in the mandate must appear in this text (tested). */
export function describeMandate(m: Mandate): string[] {
  const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
  const lines = [
    `The agent may refund up to ${usd(m.perActionCapCents)} on its own.`,
    `Refunds above that, up to ${usd(m.hardMaxCents)}, wait for a person to approve them. Nothing above ${usd(m.hardMaxCents)} is ever refunded.`,
    `In any 24 hours the agent alone may refund up to ${usd(m.dailyCapCents)}; beyond that a person must approve, and the absolute daily limit is ${usd(m.hardDailyCapCents)}.`,
    m.returnWindowDays != null ? `Refunds are refused after ${m.returnWindowDays} days from the payment.` : 'There is no return-window limit.',
    m.blockIfOpenDispute ? 'Refunds are refused while the payment has an open PayPal dispute.' : 'Open disputes do not block refunds.',
    m.escalateFullOrder === false ? 'Refunding a whole order does not need a person.' : 'Refunding every item of an order always needs a person to approve it.',
    m.dupWindowMs === 0 ? 'Repeat refunds of the same amount are allowed.' : `An identical refund repeated within ${Math.round((m.dupWindowMs ?? 86_400_000) / 3_600_000)} hours is refused.`,
    m.shadow ? 'SHADOW MODE: decisions are recorded but nothing is enforced.' : 'Decisions are enforced.',
    `This mandate expires on ${new Date(m.expiresAt).toISOString().slice(0, 10)}.`,
  ];
  return lines;
}
