import { useEffect, useState } from 'react';

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !('ok' in j) && !('status' in j)) throw Object.assign(new Error(j.why ?? j.error ?? `HTTP ${r.status}`), { status: r.status, body: j });
  return j;
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const KIND = { allow: ['✓', 'ALLOWED'], block: ['✕', 'BLOCKED'], escalate: ['!', 'ESCALATED'] } as const;
export function Chip({ kind }: { kind: keyof typeof KIND }) {
  return <span className={`chip ${kind}`}><span aria-hidden="true">{KIND[kind][0]}</span>{KIND[kind][1]}</span>;
}
export const kindOf = (status: string): keyof typeof KIND | null =>
  status === 'executed' || status === 'allowed' ? 'allow' : status === 'blocked' ? 'block' : status === 'pending_approval' ? 'escalate' : null;

export function ModeChip() {
  const [mode, setMode] = useState<string>('');
  useEffect(() => {
    fetch('/health').then((r) => r.json()).then((j) => setMode(j.mode === 'live' ? 'LIVE-FIRE (PayPal sandbox)' : 'SIMULATED')).catch(() => setMode('OFFLINE'));
  }, []);
  return <span className="chip mode" title="Live mode calls the PayPal sandbox; simulated stubs only the final PayPal call.">{mode || '...'}</span>;
}
