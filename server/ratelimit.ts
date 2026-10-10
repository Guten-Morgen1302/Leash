// Small fixed-window per-IP limiter (single instance). Keys on req.ip, so `trust proxy` must be set behind a proxy.
import type { NextFunction, Request, Response } from 'express';

export function rateLimit(max: number, windowMs = 60_000, now: () => number = Date.now) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const t = now();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
    const key = req.ip ?? 'unknown';
    const h = hits.get(key);
    if (!h || h.reset <= t) { hits.set(key, { n: 1, reset: t + windowMs }); return next(); }
    if (++h.n > max) return void res.status(429).set('Retry-After', String(Math.ceil((h.reset - t) / 1000))).json({ error: 'rate_limited', fix: 'Slow down and retry shortly.' });
    next();
  };
}
