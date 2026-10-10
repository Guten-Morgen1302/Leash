import type { Db } from './db.ts';

export function applySchema(db: Db): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS payments(
  txn_id TEXT PRIMARY KEY, captured_cents INTEGER NOT NULL, refunded_cents INTEGER NOT NULL DEFAULT 0,
  reserved_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD', source TEXT, captured_at INTEGER);
CREATE TABLE IF NOT EXISTS orders(order_id TEXT PRIMARY KEY, capture_id TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS order_items(
  order_id TEXT NOT NULL, item_id TEXT NOT NULL, name TEXT NOT NULL, unit_cents INTEGER NOT NULL, qty INTEGER NOT NULL,
  refunded_qty INTEGER NOT NULL DEFAULT 0, reserved_qty INTEGER NOT NULL DEFAULT 0,
  refundable INTEGER NOT NULL DEFAULT 1, flag TEXT, PRIMARY KEY(order_id, item_id));
CREATE TABLE IF NOT EXISTS actions(
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, tool TEXT, capture_id TEXT, amount_cents INTEGER, decision TEXT, rule_id TEXT,
  reason TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS actions_win ON actions(session_id, created_at);
CREATE TABLE IF NOT EXISTS action_items(action_id TEXT NOT NULL, order_id TEXT NOT NULL, item_id TEXT NOT NULL, qty INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS approvals(action_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS grants(
  id TEXT PRIMARY KEY, args_hash TEXT NOT NULL, session_id TEXT NOT NULL, action_id TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS grants_lookup ON grants(args_hash, session_id, used);
CREATE TABLE IF NOT EXISTS ledger(
  seq INTEGER PRIMARY KEY AUTOINCREMENT, action_id TEXT, event TEXT, payload_json TEXT, prev_hash TEXT, hash TEXT, created_at INTEGER);
`);
}
