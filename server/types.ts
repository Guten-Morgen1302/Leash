export interface Mandate {
  perActionCapCents: number; // largest refund the agent may issue alone
  hardMaxCents: number; // largest refund ever allowed, even with human approval
  dailyCapCents: number; // rolling 24h agent-alone refunds
  hardDailyCapCents: number; // rolling 24h absolute limit
  expiresAt: number; // epoch ms
  dupWindowMs?: number; // 0 disables the duplicate rule; default 24h
  returnWindowDays?: number | null; // refund only within N days of capture
  blockIfOpenDispute?: boolean; // refuse refunds on payments with an open dispute
  escalateFullOrder?: boolean; // refunding every item of an order needs a human (default true)
  shadow?: boolean; // record would-have decisions, never block
}

export type Status = 'allowed' | 'blocked' | 'pending_approval';

export interface Decision {
  status: Status;
  ruleId: string;
  reason: string;
}

export interface CheckResult extends Decision {
  actionId: string;
  approvalUrl?: string;
  token?: string;
  shadow?: boolean;
  wouldHave?: Decision;
}

/** Live PayPal state read BEFORE the transaction (never inside BEGIN IMMEDIATE). null = lookup failed. */
export interface ExternalState {
  disputeOpen: boolean | null;
  capturedAtMs: number | null;
}

export interface PayRow {
  c: number; // captured cents
  f: number; // refunded cents
  r: number; // reserved cents
  cur?: string;
  capturedAt?: number | null;
}

export interface CheckInput {
  actionId: string;
  sessionId: string;
  tool: string;
  captureId: string;
  amountCents: number | null;
  currency?: string;
  items?: { itemId: string; qty: number }[];
}
