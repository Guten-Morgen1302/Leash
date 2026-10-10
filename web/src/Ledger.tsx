import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from 'ag-grid-community';
import { api } from './ui';

ModuleRegistry.registerModules([AllCommunityModule]);
const theme = themeQuartz.withParams({ backgroundColor: '#FFFFFF', foregroundColor: '#0C1424', borderColor: '#D3D9E3', headerBackgroundColor: '#F3F5F8', fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, borderRadius: 0, wrapperBorderRadius: 0, accentColor: '#0C1424' });

export function Ledger() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const load = () => api('/v1/ledger?limit=500').then((j) => { setData(j); setErr(''); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const mode = data?.mode ?? '';
  const cols = useMemo<ColDef[]>(() => [
    { field: 'seq', headerName: '#', width: 80 },
    { field: 'created_at', headerName: 'Time', width: 210, valueFormatter: (p) => new Date(p.value).toISOString().replace('T', ' ').slice(0, 19) },
    { field: 'event', width: 170 },
    { field: 'rule_id', headerName: 'Rule', width: 160 },
    { field: 'amount_cents', headerName: 'Amount', width: 110, valueFormatter: (p) => (p.value == null ? '' : `$${(p.value / 100).toFixed(2)}`) },
    { headerName: 'Mode', width: 130, valueGetter: () => mode },
    { field: 'hash', headerName: 'Hash', flex: 1, minWidth: 160, valueFormatter: (p) => String(p.value ?? '').slice(0, 16) },
  ], [mode]);
  return (
    <>
      <h1>Ledger</h1>
      {err && <div className="banner error" role="alert">Could not load the ledger: {err} <button className="btn secondary" onClick={load}>Retry</button></div>}
      {data && <p className="row"><span className={`chip ${data.chain.ok ? 'allow' : 'block'}`}><span aria-hidden="true">{data.chain.ok ? '✓' : '✕'}</span>{data.chain.ok ? 'Chain verified' : 'Chain BROKEN'}</span><span className="num">{data.total} entries</span><span className="muted">Hash-chained; tamper-evident against partial edits.</span></p>}
      {data?.chain.ok && <p className="mono" aria-label="Head hash">Head after {data.chain.rows} rows: {data.chain.head}</p>}
      {data && data.total === 0 && <div className="banner">No decisions yet. Run a ticket on the Demo page.</div>}
      {data && <div style={{ height: 480 }}><AgGridReact theme={theme} rowData={data.rows} columnDefs={cols} /></div>}
      {!data && !err && <p className="muted">Loading ledger...</p>}
    </>
  );
}
