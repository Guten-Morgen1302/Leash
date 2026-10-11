import { useEffect, useState } from 'react';
import { api } from './ui';

interface Draft { source: string; runs: number; disagreements: string[]; playback: string[]; unsupported: string[]; questions: string[]; activatable: boolean }

export function Author() {
  const [samples, setSamples] = useState<{ id: string; policy: string }[]>([]);
  const [live, setLive] = useState(false);
  const [text, setText] = useState('');
  const [sample, setSample] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api('/v1/author/samples').then((j) => { setSamples(j.samples); setLive(j.live); }).catch((e) => setErr(e.message)); }, []);

  const compile = async () => {
    setBusy(true); setErr(''); setDraft(null);
    try { setDraft(await api('/v1/author/compile', { policy: text, sample })); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <>
      <h1>Author a mandate</h1>
      <p className="muted">Paste your refund policy in plain English. A model reads it three times; anything the runs disagree on, or the policy does not say, stays empty. Nothing here is activated: this is a draft you read back and sign off.</p>
      <div className="seg" role="group" aria-label="Sample policies">
        {samples.map((s) => <button key={s.id} aria-pressed={sample === s.id} onClick={() => { setSample(s.id); setText(s.policy); setDraft(null); }}>{s.id}</button>)}
      </div>
      <label htmlFor="policy" className="muted" style={{ display: 'block', marginTop: 16 }}>Policy text</label>
      <textarea id="policy" value={text} onChange={(e) => { setText(e.target.value); setSample(''); }} rows={6} style={{ width: '100%', font: 'inherit', padding: 12, border: '1px solid var(--line)', borderRadius: 6 }} />
      <div className="row"><button className="btn" onClick={compile} disabled={busy || (!text.trim() && !sample)}>{busy ? 'Compiling...' : 'Compile draft'}</button>
        <span className="muted">{live ? 'Live model.' : 'No model key on this server: the three samples show a recorded compile.'}</span></div>
      {err && <div className="banner error" role="alert">{err}</div>}
      {draft && <div className="card">
        <p className="muted">{draft.source === 'recorded' ? 'Recorded compile' : `Compiled ${draft.runs} times`}{draft.disagreements.length ? `. The runs disagreed on: ${draft.disagreements.join(', ')} (left empty).` : '. The runs agreed on every field they filled.'}</p>
        <h2>What Leash would enforce</h2>
        <ul className="plain">{draft.playback.map((l, i) => <li key={i} className={l.startsWith('NOT SET') ? 'muted' : ''}>{l.startsWith('NOT SET') ? <strong>{l}</strong> : l}</li>)}</ul>
        <h2>NOT enforced (the schema cannot express these)</h2>
        <ul className="plain">{draft.unsupported.length ? draft.unsupported.slice(0, 8).map((u, i) => <li key={i}>{u}</li>) : <li>None reported.</li>}</ul>
        <p className={draft.activatable ? '' : 'banner error'}>{draft.activatable ? 'All four spending limits are set. Activation is a deliberate step: npm run compile-policy -- --activate.' : 'Cannot be activated: at least one spending limit is empty. Leash does not guess limits. Answer the NOT SET lines first.'}</p>
      </div>}
    </>
  );
}
