import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Demo } from './Demo';
import { Approve } from './Approve';
import { Ledger } from './Ledger';
import { Mandate } from './Mandate';
import { Author } from './Author';
import { Proof } from './Proof';
import { ModeChip } from './ui';

function App() {
  const [p, setP] = useState(window.location.pathname);
  useEffect(() => {
    const f = () => setP(window.location.pathname);
    window.addEventListener('popstate', f);
    return () => window.removeEventListener('popstate', f);
  }, []);
  const go = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); history.pushState({}, '', to); setP(to); };
  const cur = (to: string) => (p === to || (to === '/demo' && p === '/') ? 'page' : undefined);
  let page;
  if (p.startsWith('/approve/')) page = <Approve actionId={p.split('/')[2] ?? ''} />;
  else if (p === '/ledger') page = <Ledger />;
  else if (p === '/mandate') page = <Mandate />;
  else if (p === '/author') page = <Author />;
  else if (p === '/proof') page = <Proof />;
  else page = <Demo />;
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/demo" onClick={go('/demo')}>Leash</a>
        <nav aria-label="Main">
          <a href="/demo" aria-current={cur('/demo')} onClick={go('/demo')}>Demo</a>
          <a href="/ledger" aria-current={cur('/ledger')} onClick={go('/ledger')}>Ledger</a>
          <a href="/author" aria-current={cur('/author')} onClick={go('/author')}>Author</a>
          <a href="/mandate" aria-current={cur('/mandate')} onClick={go('/mandate')}>Mandate</a>
          <a href="/proof" aria-current={cur('/proof')} onClick={go('/proof')}>Proof</a>
        </nav>
        <ModeChip />
      </header>
      <main>{page}</main>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
