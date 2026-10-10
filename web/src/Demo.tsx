import { useEffect, useRef, useState } from 'react';
import { api, Chip, dollars, kindOf } from './ui';

interface Ticket { id: number; title: string; body: string; expected: string }
interface RunResult { requested: { item: string; amount: string }[]; unguarded: { amount: string; refundId: string }; guarded: any; exposure: { spentCents: number; hardDailyCapCents: number } }

function describe(g: any): string {
  if (g.status === 'executed') return `refunded ${dollars(g.amountCents)}.`;
  if (g.status === 'blocked') return `blocked by ${g.ruleId}.`;
  if (g.status === 'pending_approval') return 'waiting for a human to approve.';
  return g.status;
}

export function Demo() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sel, setSel] = useState(2);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'unguarded' | 'done' | 'error'>('idle');
  const [res, setRes] = useState<RunResult | null>(null);
  const [err, setErr] = useState('');
  const [live, setLive] = useState('');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => { api('/v1/demo/tickets').then((j) => setTickets(j.tickets)).catch((e) => { setErr(e.message); setPhase('error'); }); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const run = async () => {
    clearTimeout(timer.current);
    setRes(null); setErr(''); setLive(''); setPhase('loading'); // always reset both lanes first
    try {
      const j: RunResult = await api('/v1/demo/run', { ticketId: sel });
      setRes(j); setPhase('unguarded'); setLive(`Without Leash: refunded $${j.unguarded.amount}.`);
      timer.current = window.setTimeout(() => { setPhase('done'); setLive((l) => `${l} With Leash: ${describe(j.guarded)}`); }, 600);
    } catch (e: any) { setErr(e.message); setPhase('error'); }
  };

  const retry = async () => {
    try {
      const j = await api('/v1/demo/retry', { actionId: res!.guarded.actionId });
      setRes({ ...res!, guarded: j.guarded, exposure: j.exposure });
      setLive(`Agent retried after approval: ${describe(j.guarded)}`);
    } catch (e: any) { setErr(e.message); setPhase('error'); }
  };

  const ticket = tickets.find((t) => t.id === sel);
  return (
    <>
      <h1>Same agent, same ticket. One lane has Leash.</h1>
      <p className="muted">Pick a customer ticket. Both lanes replay the same agent request; the right lane runs it through the real Leash gate (simulated PayPal, fake money).</p>
      <div className="seg" role="group" aria-label="Ticket">
        {tickets.map((t) => <button key={t.id} aria-pressed={sel === t.id} onClick={() => { setSel(t.id); setPhase('idle'); setRes(null); }}>{t.id}. {t.title}</button>)}
      </div>
      {ticket && <div className="ticket" aria-label="Customer ticket">{ticket.body}</div>}
      <button className="btn" onClick={run} disabled={phase === 'loading' || !ticket}>{phase === 'loading' ? 'Running...' : 'Run both lanes'}</button>
      <div className="sr" role="status" aria-live="polite">{live}</div>
      {phase === 'error' && <div className="banner error" role="alert">Something went wrong: {err}. <button className="btn secondary" onClick={run}>Try again</button></div>}
      <div className="lanes">
        <section className="lane" aria-label="Without Leash">
          <h2>Without Leash</h2>
          {!res && <p className="muted">{phase === 'loading' ? 'Running the agent...' : 'Press "Run both lanes" to see what the agent does.'}</p>}
          {res && <>
            <p className="muted">Agent asked to refund: {res.requested.map((r) => `${r.item} $${r.amount}`).join(', ')}</p>
            <div className="outcome-word">REFUNDED ${res.unguarded.amount}</div>
            <p className="mono">{res.unguarded.refundId}</p>
            <p><strong>Exposure: unlimited</strong></p>
          </>}
        </section>
        <section className="lane" aria-label="With Leash">
          <h2>With Leash</h2>
          {phase !== 'done' && <p className="muted">{res ? 'Waiting for the gate...' : phase === 'loading' ? 'Checking the mandate...' : 'Press "Run both lanes".'}</p>}
          {res && phase === 'done' && <Guarded r={res} onRetry={retry} />}
        </section>
      </div>
    </>
  );
}

function Guarded({ r, onRetry }: { r: RunResult; onRetry: () => void }) {
  const g = r.guarded; const kind = kindOf(g.status);
  return (
    <div className="settle">
      {kind && <Chip kind={kind} />}
      <div className="outcome-word">{g.status === 'executed' ? `REFUNDED ${dollars(g.amountCents)}` : g.status === 'blocked' ? 'NOT REFUNDED' : g.status === 'pending_approval' ? 'WAITING FOR APPROVAL' : g.status}</div>
      {g.ruleId && <p className="mono">{g.ruleId}</p>}
      {g.reason && <p>{g.reason}</p>}
      {g.status === 'pending_approval' && <div className="row">
        <a className="btn" href={g.approvalUrl.replace(/^https?:\/\/[^/]+/, '')} target="_blank" rel="noreferrer">Open approval page</a>
        <button className="btn secondary" onClick={onRetry}>Agent retries after approval</button>
      </div>}
      <p className="num"><strong>Exposure today: {dollars(r.exposure.spentCents)} of {dollars(r.exposure.hardDailyCapCents)} hard daily cap</strong></p>
    </div>
  );
}
