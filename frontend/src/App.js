import { useState } from 'react';
import './index.css';
import Dashboard  from './components/Dashboard';
import Portfolio  from './components/Portfolio';
import Risk       from './components/Risk';
import Stress     from './components/Stress';
import Accounts   from './components/Accounts';
import TaxBuckets from './components/TaxBuckets';
import ImportPage from './components/ImportPage';
import Advisor    from './components/Advisor';
import Rebalance  from './components/Rebalance';

const TABS = [
  { id:'dashboard', label:'Dashboard' },
  { id:'portfolio', label:'Portfolio' },
  { id:'risk',      label:'Risk & Volatility' },
  { id:'stress',    label:'Stress Testing' },
  { id:'advisor',   label:'AI Advisor' },
  { id:'rebalance', label:'Rebalance' },
  { id:'accounts',  label:'Accounts' },
  { id:'tax',       label:'Tax Buckets' },
  { id:'import',    label:'Import / Export' },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [nw,  setNw]  = useState(15875656);
  const PAGE = {
    dashboard: <Dashboard onNetWorthUpdate={setNw} />,
    portfolio: <Portfolio />,
    risk:      <Risk />,
    stress:    <Stress />,
    advisor:   <Advisor />,
    rebalance: <Rebalance />,
    accounts:  <Accounts />,
    tax:       <TaxBuckets />,
    import:    <ImportPage onImport={() => setTab('dashboard')} />,
  };
  return (
    <>
      <header className="hdr">
        <div className="hdr-logo">Wealth<span>OS</span></div>
        <div>
          <div className="hdr-nw">{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(nw)}</div>
          <div className="hdr-sub">NET WORTH · MARCH 2026</div>
        </div>
      </header>
      <nav className="sitenav">
        {TABS.map(t => <button key={t.id} className={tab===t.id?'active':''} onClick={()=>setTab(t.id)}>{t.label}</button>)}
      </nav>
      <main>{PAGE[tab]}</main>
    </>
  );
}
