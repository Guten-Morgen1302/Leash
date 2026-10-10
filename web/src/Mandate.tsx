import { useEffect, useState } from 'react';
import { api } from './ui';

export function Mandate() {
  const [lines, setLines] = useState<string[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/v1/mandate').then((j) => setLines(j.lines)).catch((e) => setErr(e.message)); }, []);
  return (
    <>
      <h1>Mandate</h1>
      <p className="muted">Read-only. This is the rulebook the gate enforces, in plain language. Change limits by editing mandate.json and restarting.</p>
      {err && <div className="banner error" role="alert">Could not load the mandate: {err}</div>}
      {!lines && !err && <p className="muted">Loading...</p>}
      {lines && <ul className="plain">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </>
  );
}
