// HTTP listener: API (+ built SPA in production, Phase 3). Sweeps stuck reservations and shuts down cleanly.
import { existsSync } from 'node:fs';
import express from 'express';
import { createApp } from './app.ts';
import { loadMandate, MandateError } from './config.ts';
import { openDb } from './db.ts';
import { sweep } from './dispatch.ts';
import { PayPalClient } from './paypal.ts';
import { applySchema } from './schema.ts';

let mandate;
try { mandate = loadMandate(process.env.LEASH_MANDATE ?? 'mandate.json'); } catch (e) {
  console.error(`Leash: ${e instanceof MandateError ? e.message : String(e)}`);
  process.exit(1);
}
const production = process.env.NODE_ENV === 'production';
const db = await openDb(process.env.LEASH_DB ?? 'leash.db');
applySchema(db);
const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET;
const paypal = id && secret ? new PayPalClient({ baseUrl: process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com', clientId: id, clientSecret: secret }) : null;
const port = Number(process.env.PORT ?? 4317);
const publicUrl = process.env.LEASH_PUBLIC_URL ?? `http://127.0.0.1:${port}`;
const app = createApp({ db, mandate: mandate!, paypal, publicUrl }, { token: process.env.LEASH_TOKEN, production });
if (existsSync('web/dist')) {
  app.use(express.static('web/dist'));
  app.get(/^\/(?!v1\/).*/, (_req, res) => void res.sendFile('index.html', { root: 'web/dist' }));
}
const timer = setInterval(() => { try { sweep(db, Date.now()); } catch { /* retried next tick */ } }, 60_000);
const listen = (p: number, left = 10): Promise<{ server: import('node:http').Server; port: number }> =>
  new Promise((resolve, reject) => {
    // Express 5 passes a listen error to the callback
    const srv = app.listen(p, (e?: Error) => {
      if (!e) return resolve({ server: srv, port: p });
      (e as NodeJS.ErrnoException).code === 'EADDRINUSE' && left > 0 ? resolve(listen(p + 1, left - 1)) : reject(e);
    });
  });
const { server, port: bound } = await listen(port);
console.log(`Leash on ${process.env.LEASH_PUBLIC_URL ?? `http://127.0.0.1:${bound}`} (${paypal ? 'LIVE-FIRE sandbox' : 'SIMULATED'})`);
const stop = () => { clearInterval(timer); server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
