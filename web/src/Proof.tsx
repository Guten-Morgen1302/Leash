import { useEffect, useState } from 'react';
import { api } from './ui';

export function Proof() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/v1/proof').then(setData).catch((e) => setErr(e.message)); }, []);
  return (
    <>
      <h1>Live sandbox proof</h1>
      <p className="muted">The demo page is simulated. These are real PayPal sandbox refunds made through the same gate. {data?.mode === 'LIVE-FIRE' ? 'This server has sandbox credentials, so each refund below was just re-read from PayPal.' : 'This server has no sandbox credentials, so the status shown is the recorded one.'}</p>
      {err && <div className="banner error" role="alert">Could not load the proof: {err}</div>}
      {!data && !err && <p className="muted">Loading...</p>}
      {data && <div className="scroll-x"><table style={{ borderCollapse: 'collapse', width: '100%', background: 'var(--surface)' }}>
        <thead><tr>{['Refund id', 'Amount', 'How', data.mode === 'LIVE-FIRE' ? 'PayPal now' : 'Recorded'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 12, borderBottom: '1px solid var(--line)' }}>{h}</th>)}</tr></thead>
        <tbody>{data.refunds.map((r: any) => <tr key={r.refund_id}>
          <td className="mono" style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>{r.refund_id}</td>
          <td className="num" style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>{r.amount} {r.currency}</td>
          <td style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>{r.via}</td>
          <td className="mono" style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>{r.live ? `${r.live.status}${r.live.amount ? ` ${r.live.amount}` : ''}` : 'COMPLETED'}</td></tr>)}</tbody>
      </table></div>}
      <p className="muted">{data?.note}</p>
    </>
  );
}
