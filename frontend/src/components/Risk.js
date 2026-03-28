import { useEffect, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { api, fmt } from '../api';

export default function Risk() {
  const [metrics, setMetrics] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [conc,    setConc]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getMetrics(), api.getSectors(), api.getConcentration()])
      .then(([m,s,c])=>{setMetrics(m);setSectors(s);setConc(c);setLoading(false);})
      .catch(()=>setLoading(false));
  }, []);

  if (loading) return <div className="loading">Computing risk metrics…</div>;
  const b=parseFloat(metrics?.beta||1), h=parseFloat(metrics?.hhi||0), v=parseFloat(metrics?.volatility||0), sh=parseFloat(metrics?.sharpe||0);
  const total = conc.reduce((s,h)=>s+parseFloat(h.value),0);
  const colors = ['#c9a84c','#2563a8','#4a6741','#c0392b','#8b5cf6','#f97316','#06b6d4','#84cc16','#ec4899','#a8c5e0'];
  const factors = [
    {lbl:'STT Employer Concentration',sev:'High',desc:`STT is ~${fmt.pct((conc.find(x=>x.ticker==='STT')?.value||946411)/total*100)} of your portfolio. Recommend sell-on-vest into VOO.`},
    {lbl:'JEPQ/JEPI Tax Drag',sev:'High',desc:'Covered-call ETFs in taxable accounts generate ordinary income. Consider repositioning to IRA — saves $24K–$32K/yr.'},
    {lbl:'Equity Beta Exposure',sev:'Medium',desc:`Beta ${b.toFixed(2)}. In a S&P −20% drawdown, estimated loss: ${fmt.dollar(total*b*0.20)}.`},
    {lbl:'Idle Cash Drag',sev:'Medium',desc:'$1.78M in savings at ~2%. T-bills yield ~5.2%. Opportunity cost: ~$57K/yr.'},
    {lbl:'HHI Concentration',sev:h>2000?'High':'Medium',desc:`HHI ${Math.round(h).toLocaleString()}. ${h>2500?'Significantly concentrated — top 3 positions = 27%.':'Moderate concentration.'}`},
    {lbl:'Gold Inflation Hedge',sev:'Positive',desc:'SLV + GLDM + GLD provide effective hedge in inflation surge and risk-off scenarios.'}
  ];
  const sevClass = {High:'bdg-red',Medium:'bdg-amber',Positive:'bdg-sage'};

  return (
    <div>
      <div className="stitle">Risk &amp; Volatility <small>Computed from holdings · March 2026</small></div>
      <div className="g4 mb18">
        <div className="kpi"><div className="kpi-lbl">Portfolio Beta</div><div className={`kpi-val ${b>1.2?'neg':b<0.8?'pos':''}`}>{b.toFixed(2)}</div><div className="kpi-sub">vs. S&amp;P 500 (1.0)</div></div>
        <div className="kpi"><div className="kpi-lbl">HHI Concentration</div><div className={`kpi-val ${h>2500?'neg':''}`}>{Math.round(h).toLocaleString()}</div><div className="kpi-sub">&lt;1500 = diversified</div></div>
        <div className="kpi"><div className="kpi-lbl">Est. Annual Volatility</div><div className="kpi-val">{v.toFixed(1)}%</div><div className="kpi-sub">Annualized</div></div>
        <div className="kpi"><div className="kpi-lbl">Sharpe Ratio Est.</div><div className={`kpi-val ${sh>1?'pos':sh<0.5?'neg':''}`}>{sh.toFixed(2)}</div><div className="kpi-sub">&gt;1.0 = attractive</div></div>
      </div>
      <div className="g2 mb18">
        <div className="card">
          <div className="card-hdr"><div><div className="card-title">Sector Breakdown</div><div className="card-sub">By estimated sector</div></div></div>
          <div className="ch-wrap ch-md"><Doughnut data={{labels:sectors.slice(0,10).map(s=>s.sector),datasets:[{data:sectors.slice(0,10).map(s=>s.value),backgroundColor:colors,borderWidth:2,borderColor:'#fff'}]}} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:10.5},boxWidth:11}}}}}/></div>
        </div>
        <div className="card">
          <div className="card-hdr"><div className="card-title">Concentration Map</div></div>
          {conc.filter(h=>h.pct>1).map((h,i)=>{const clr=h.pct>8?'var(--red)':h.pct>5?'var(--amber)':'var(--gold)';return(<div key={i} className="row-m"><span className="lbl"><span className="tkr">{h.ticker}</span></span><div className="pb"><div className="pb-fill" style={{width:`${Math.min(h.pct*6,100)}%`,background:clr}}/></div><span className="val" style={{color:clr}}>{fmt.pct(h.pct)}</span></div>);})}
        </div>
      </div>
      <div className="card">
        <div className="card-title">Risk Factor Analysis</div>
        {factors.map((f,i)=><div key={i} style={{display:'flex',gap:14,padding:'11px 0',borderBottom:i<factors.length-1?'1px solid var(--border)':'none',alignItems:'flex-start'}}><div style={{width:195,flexShrink:0,fontSize:13,fontWeight:600}}>{f.lbl}</div><span className={`bdg ${sevClass[f.sev]||'bdg-blue'}`} style={{flexShrink:0}}>{f.sev}</span><div style={{fontSize:12.5,color:'var(--muted)',lineHeight:1.6}}>{f.desc}</div></div>)}
      </div>
    </div>
  );
}
