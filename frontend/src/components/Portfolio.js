import { useEffect, useState } from 'react';
import { api, fmt } from '../api';

export default function Portfolio() {
  const [holdings, setHoldings] = useState([]);
  const [search,   setSearch]   = useState('');
  const [sort,     setSort]     = useState('v-d');
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const PER = 25;

  useEffect(() => { api.getHoldings().then(h=>{setHoldings(h);setLoading(false);}).catch(()=>setLoading(false)); }, []);

  const total = holdings.reduce((s,h)=>s+parseFloat(h.value),0);
  let filtered = holdings.filter(h=>h.ticker.toLowerCase().includes(search.toLowerCase())||h.name.toLowerCase().includes(search.toLowerCase()));
  filtered = [...filtered].sort((a,b)=>sort==='v-d'?b.value-a.value:sort==='v-a'?a.value-b.value:sort==='d-d'?b.day1_change-a.day1_change:a.ticker.localeCompare(b.ticker));
  const pages = Math.ceil(filtered.length/PER);
  const visible = filtered.slice((page-1)*PER, page*PER);

  function exportCSV() {
    const lines = ['Ticker,Name,Shares,Price,Change%,1-Day$,Value'];
    holdings.forEach(h=>lines.push(`${h.ticker},"${h.name}",${h.shares},${h.price},${h.change_pct},${h.day1_change},${h.value}`));
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'})); a.download='wealthos_holdings.csv'; a.click();
  }

  if (loading) return <div className="loading">Loading holdings…</div>;
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
        <div className="stitle" style={{margin:0}}>All Holdings <small>{holdings.length} positions</small></div>
        <div style={{display:'flex',gap:10}}>
          <input style={{padding:'8px 13px',border:'1px solid var(--border)',borderRadius:7,fontSize:13,width:220,outline:'none'}} placeholder="Search ticker / name…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} />
          <select style={{padding:'8px 13px',border:'1px solid var(--border)',borderRadius:7,fontSize:12.5,background:'var(--surface)'}} onChange={e=>setSort(e.target.value)}>
            <option value="v-d">Value ↓</option><option value="v-a">Value ↑</option><option value="d-d">1-Day ↓</option><option value="t-a">Ticker A–Z</option>
          </select>
          <button className="btn btn-outline btn-sm" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>
      <div className="card">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Ticker</th><th>Name</th><th className="r">Shares</th><th className="r">Price</th><th className="r">Chg%</th><th className="r">1-Day $</th><th className="r">Value</th><th className="r">Wt%</th></tr></thead>
            <tbody>{visible.map((h,i)=><tr key={i}><td><span className="tkr">{h.ticker}</span></td><td className="txt">{h.name}</td><td className="r">{parseFloat(h.shares).toLocaleString(undefined,{maximumFractionDigits:2})}</td><td className="r">{fmt.dollar(h.price)}</td><td className={`r ${parseFloat(h.change_pct)>=0?'pos':'neg'}`}>{parseFloat(h.change_pct).toFixed(2)}%</td><td className={`r ${parseFloat(h.day1_change)>=0?'pos':'neg'}`}>{fmt.sign(parseFloat(h.day1_change))}</td><td className="r">{fmt.dollar(h.value)}</td><td className="r">{fmt.pct(parseFloat(h.value)/total*100)}</td></tr>)}</tbody>
          </table>
        </div>
        {pages>1&&<div style={{display:'flex',gap:5,justifyContent:'flex-end',marginTop:10}}>{Array.from({length:pages},(_,i)=><button key={i} onClick={()=>setPage(i+1)} style={{padding:'4px 11px',border:'1px solid var(--border)',background:page===i+1?'var(--ink)':'var(--surface)',color:page===i+1?'#fff':'inherit',borderRadius:5,fontSize:11.5,cursor:'pointer'}}>{i+1}</button>)}</div>}
      </div>
    </div>
  );
}
