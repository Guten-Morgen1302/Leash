// One Db interface over two SQLite drivers (better-sqlite3 and node:sqlite) and ONE transaction helper.
// dispatch/policy code never touches .prepare(), .pluck() or db.transaction(): everything goes through this file.

export type Driver = 'better-sqlite3' | 'node:sqlite';
export type Row = Record<string, any>;

export interface Db {
  readonly driver: Driver;
  exec(sql: string): void;
  run(sql: string, ...p: unknown[]): { changes: number };
  one<T = Row>(sql: string, ...p: unknown[]): T | undefined;
  all<T = Row>(sql: string, ...p: unknown[]): T[];
  val<T = any>(sql: string, ...p: unknown[]): T | undefined; // first column of first row
  close(): void;
}

export class LeashBusyError extends Error {
  constructor() {
    super('Leash database is busy, retry');
    this.name = 'LeashBusyError';
  }
}

export const isBusy = (e: any): boolean =>
  e?.code === 'SQLITE_BUSY' || e?.errcode === 5 || /database is locked|SQLITE_BUSY/i.test(String(e?.message));

export interface OpenOptions {
  busyTimeoutMs?: number;
  driver?: Driver;
}

export async function openDb(path: string, o: OpenOptions = {}): Promise<Db> {
  const want = o.driver ?? (process.env.LEASH_DB_DRIVER as Driver | undefined);
  let raw: any;
  let driver: Driver = 'node:sqlite';
  if (want !== 'node:sqlite') {
    try {
      const { default: BS } = await import('better-sqlite3');
      raw = new BS(path);
      driver = 'better-sqlite3';
    } catch (e) {
      if (want === 'better-sqlite3') throw e;
    }
  }
  if (!raw) {
    const { DatabaseSync } = await import('node:sqlite');
    raw = new DatabaseSync(path);
    driver = 'node:sqlite';
  }
  raw.exec(
    `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=${Number(o.busyTimeoutMs ?? 3000)};`,
  );

  const cache = new Map<string, any>();
  const st = (sql: string) => {
    let s = cache.get(sql);
    if (!s) cache.set(sql, (s = raw.prepare(sql)));
    return s;
  };
  // node:sqlite rejects undefined and booleans
  const bind = (p: unknown[]) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? +v : v));
  const plain = (r: any) => (r === undefined || r === null ? undefined : { ...r }); // node:sqlite rows have a null prototype

  return {
    driver,
    exec: (s) => raw.exec(s),
    run: (s, ...p) => ({ changes: Number(st(s).run(...bind(p)).changes) }),
    one: <T = Row>(s: string, ...p: unknown[]) => plain(st(s).get(...bind(p))) as T | undefined,
    all: <T = Row>(s: string, ...p: unknown[]) => (st(s).all(...bind(p)) as any[]).map((r) => ({ ...r })) as T[],
    val: <T = any>(s: string, ...p: unknown[]) => {
      const r = st(s).get(...bind(p));
      return (r === undefined || r === null ? undefined : Object.values(r)[0]) as T | undefined;
    },
    close: () => raw.close(),
  };
}

const open = new WeakSet<Db>();

/** BEGIN IMMEDIATE / COMMIT / ROLLBACK, identical on both drivers. The callback MUST be synchronous. */
export function tx<T>(db: Db, fn: () => T): T {
  if (open.has(db)) throw new Error('nested tx is not supported');
  try {
    db.exec('BEGIN IMMEDIATE'); // busy_timeout is spent inside this call
  } catch (e) {
    throw isBusy(e) ? new LeashBusyError() : e;
  }
  open.add(db);
  try {
    const out = fn();
    if (typeof (out as any)?.then === 'function') throw new Error('tx callback must be synchronous');
    db.exec('COMMIT');
    return out;
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* already rolled back by SQLite */
    }
    throw e;
  } finally {
    open.delete(db);
  }
}
