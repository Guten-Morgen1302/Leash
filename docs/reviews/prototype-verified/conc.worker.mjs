import { parentPort, workerData as w } from 'node:worker_threads';
import { openDb, tx } from './db.mjs';
import { check } from './dispatch.mjs';
const db = await openDb(w.path, { busyTimeoutMs: w.busyTimeoutMs ?? 3000, driver: w.driver });
const gate = new Int32Array(w.gate);
parentPort.postMessage({ ready: true });
Atomics.wait(gate, 0, 0);
const t0 = performance.now();
try {
  if (w.holdMs) { tx(db, () => { parentPort.postMessage({ locked: true }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, w.holdMs); }); parentPort.postMessage({ done: true }); }
  else parentPort.postMessage({ d: check(db, w.mandate, w.input), ms: performance.now() - t0 });
} catch (e) { parentPort.postMessage({ err: `${e?.code ?? ''}${e?.errcode ?? ''} ${e?.name ?? ''} ${e?.message ?? e}`, ms: performance.now() - t0 }); }
