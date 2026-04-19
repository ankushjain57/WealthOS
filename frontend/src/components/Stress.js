import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { api, fmt } from '../api';

export default function Stress() {
  const [scenarios, setScenarios] = useState([]);
  const [detail,    setDetail]    = useState(null);
  const [active,    setActive]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [detailSort, setDetailSort] = useState({ col: 'impact', dir: 'desc' });

  useEffect(() => { api.getAllStress().then(s=>{setScenarios(s);setLoading(false);}).catch(()=>setLoading(false)); }, []);

  function selectScn(key) { setActive(key); api.getStressDetail(key).then(setDetail); }

  function toggleDetailSort(col) {
    setDetailSort(prev => ({ col, dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc' }));
  }

  if (loading) return <div className="loading">Running stress scenarios…</div>;
  const chartData = { labels:scenarios.map(s=>s.label), datasets:[{data:scenarios.map(s=>s.impact),backgroundColor:scenarios.map(s=>s.impact<0?'rgba(181,45,45,.7)':'rgba(61,107,53,.7)'),borderColor:scenarios.map(s=>s.impact<0?'#b52d2d':'#3d6b35'),borderWidth:1}] };
  const sortedDetailItems = detail?.items
    ? [...detail.items].sort((a, b) => {
        const dir = detailSort.dir === 'asc' ? 1 : -1;
        const av = detailSort.col === 'ticker' ? (a.ticker || '') : parseFloat(a[detailSort.col]) || 0;
        const bv = detailSort.col === 'ticker' ? (b.ticker || '') : parseFloat(b[detailSort.col]) || 0;
        if (detailSort.col === 'ticker') {
          return dir * String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
        }
        return dir * (av - bv);
      })
    : [];

  const SortTh = ({ col, label, align }) => {
    const activeSort = detailSort.col === col;
    return (
      <th
        className={align === 'r' ? 'r' : ''}
        style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}
        onClick={() => toggleDetailSort(col)}
      >
        {label}{' '}
        <span style={{ opacity: activeSort ? 1 : 0.25, fontSize: 9 }}>
          {activeSort ? (detailSort.dir === 'asc' ? '▲' : '▼') : '▾'}
        </span>
      </th>
    );
  };

  return (
    <div>
      <div className="stitle">Stress Testing <small>2026 market scenarios</small></div>
      <div className="g5 mb18">
        {scenarios.map(s=><div key={s.key} className={`scn ${active===s.key?'sel':''}`} onClick={()=>selectScn(s.key)}><div className="scn-icon">{s.icon}</div><div className="scn-name">{s.label}</div><div className={`scn-val ${s.impact<0?'scn-loss':'scn-gain'}`}>{fmt.dollar(s.impact)}</div><div className="scn-sub">{fmt.pct(s.pct)} impact</div></div>)}
      </div>
      <div className="g2 mb18">
        <div className="card">
          <div className="card-title">Portfolio Impact by Scenario</div>
          <div className="ch-wrap ch-md"><Bar data={chartData} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>fmt.dollar(v),font:{family:"'DM Mono',monospace",size:10}}}}}}/></div>
        </div>
        <div className="card">
          <div className="card-title">{detail?detail.label:'← Select a scenario'}</div>
          {!detail&&<div style={{textAlign:'center',padding:40,color:'var(--muted)'}}>Click a scenario card above to see details.</div>}
          {detail&&<><div style={{marginBottom:16}}><div className="kpi"><div className="kpi-lbl">Total Impact</div><div className={`kpi-val ${detail.totalImpact<0?'neg':'pos'}`}>{fmt.dollar(detail.totalImpact)}</div><div className="kpi-sub">{fmt.pct(detail.pct)} of portfolio</div></div></div><div className="tbl-wrap" style={{maxHeight:240,overflowY:'auto'}}><table><thead><tr><SortTh col="ticker" label="Ticker" /><SortTh col="product" label="Product" /><SortTh col="value" label="Value" align="r" /><SortTh col="shock" label="Shock" align="r" /><SortTh col="impact" label="Impact" align="r" /></tr></thead><tbody>{sortedDetailItems.slice(0,15).map((item,i)=><tr key={i}><td><span className="tkr">{item.ticker}</span></td><td style={{fontSize:11.5,color:'var(--muted)'}}>{item.product_type||'—'}</td><td className="r">{fmt.dollar(item.value)}</td><td className={`r ${item.shock<0?'neg':'pos'}`}>{fmt.pct(item.shock*100)}</td><td className={`r ${item.impact<0?'neg':'pos'}`}>{fmt.dollar(item.impact)}</td></tr>)}</tbody></table></div></>}
        </div>
      </div>
    </div>
  );
}
