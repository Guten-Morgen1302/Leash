// Faithful JS port of the designed server/db.ts (verification harness, not repo code)
export class LeashBusyError extends Error { constructor() { super('Leash database is busy, retry'); this.name = 'LeashBusyError'; } }
export const isBusy = (e) => e?.code === 'SQLITE_BUSY' || e?.errcode === 5 || /database is locked|SQLITE_BUSY/i.test(String(e?.message));

export async function openDb(path, o = {}) {
  const want = o.driver ?? process.env.LEASH_DB_DRIVER;
  let raw, driver;
  if (want !== 'node:sqlite') {
    try { const { default: BS } = await import('better-sqlite3'); raw = new BS(path); driver = 'better-sqlite3'; }
    catch (e) { if (want === 'better-sqlite3') throw e; }
  }
  if (!raw) { const { DatabaseSync } = await import('node:sqlite'); raw = new DatabaseSync(path); driver = 'node:sqlite'; }
  raw.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=${Number(o.busyTimeoutMs ?? 3000)};`);
  const cache = new Map();
  const st = (sql) => cache.get(sql) ?? (cache.set(sql, raw.prepare(sql)), cache.get(sql));
  const bind = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? +v : v));
  return {
    driver, exec: (s) => raw.exec(s),
    run: (s, ...p) => ({ changes: Number(st(s).run(...bind(p)).changes) }),
    one: (s, ...p) => { const r = st(s).get(...bind(p)); return r === undefined ? undefined : { ...r }; },   // plain objects: node:sqlite rows have a null prototype
    all: (s, ...p) => st(s).all(...bind(p)).map((r) => ({ ...r })),
    val: (s, ...p) => { const r = st(s).get(...bind(p)); return r === undefined ? undefined : Object.values(r)[0]; },
    close: () => raw.close(),
  };
}

const open = new WeakSet();
export function tx(db, fn) {
  if (open.has(db)) throw new Error('nested tx is not supported');
  try { db.exec('BEGIN IMMEDIATE'); } catch (e) { throw isBusy(e) ? new LeashBusyError() : e; }
  open.add(db);
  try {
    const out = fn();
    if (typeof out?.then === 'function') throw new Error('tx callback must be synchronous');
    db.exec('COMMIT');
    return out;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  } finally { open.delete(db); }
}

export function applySchema(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS payments(txn_id TEXT PRIMARY KEY, captured_cents INTEGER NOT NULL, refunded_cents INTEGER NOT NULL DEFAULT 0, reserved_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD', source TEXT);
CREATE TABLE IF NOT EXISTS actions(id TEXT PRIMARY KEY, session_id TEXT NOT NULL, tool TEXT, capture_id TEXT, amount_cents INTEGER, decision TEXT, rule_id TEXT, reason TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS actions_win ON actions(session_id, created_at);
CREATE TABLE IF NOT EXISTS approvals(action_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS grants(id TEXT PRIMARY KEY, args_hash TEXT NOT NULL, session_id TEXT NOT NULL, action_id TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS grants_lookup ON grants(args_hash, session_id, used);
CREATE TABLE IF NOT EXISTS ledger(seq INTEGER PRIMARY KEY AUTOINCREMENT, action_id TEXT, event TEXT, payload_json TEXT, prev_hash TEXT, hash TEXT, created_at INTEGER);
`);
}
