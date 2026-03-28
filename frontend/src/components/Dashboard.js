import { useEffect, useState } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { api, fmt } from '../api';
ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function Dashboard({ onNetWorthUpdate }) {
  const [summary, setSummary] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [topH,    setTopH]    = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getSummary(), api.getSectors(), api.getConcentration(), api.getBuckets()])
      .then(([s,sec,top,bk]) => {
        setSummary(s); setSectors(sec); setTopH(top); setBuckets(bk);
        if (onNetWorthUpdate && s.total_value) onNetWorthUpdate(parseFloat(s.total_value));
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading portfolio…</div>;

  const totalInv = parseFloat(summary?.total_value || 0);
  const dayPL    = parseFloat(summary?.total_day1   || 0);
  const colors   = ['#c9a84c','#2563a8','#4a6741','#c0392b','#8b5cf6','#f97316','#06b6d4','#84cc16','#ec4899','#a8c5e0'];
  const bucketMap = {};
  buckets.forEach(b => { bucketMap[b.tax_bucket] = parseFloat(b.total); });
  const totalAccounts = Object.values(bucketMap).reduce((a,b)=>a+b,0);

  return (
    <div>
      <div className="stitle">Dashboard <small>Portfolio snapshot · March 2026</small></div>
      <div className="g4 mb18">
        <div className="kpi"><div className="kpi-lbl">Total Investments</div><div className="kpi-val">{fmt.dollar(totalInv)}</div><div className="kpi-sub">{summary?.position_count} positions</div></div>
        <div className="kpi"><div className="kpi-lbl">Today's P&amp;L</div><div className={`kpi-val ${dayPL>=0?'pos':'neg'}`}>{fmt.sign(dayPL)}</div><div className="kpi-sub">Across all holdings</div></div>
        <div className="kpi"><div className="kpi-lbl">Taxable</div><div className="kpi-val">{fmt.dollar(bucketMap['Taxable']||0)}</div><div className="kpi-sub">{fmt.pct((bucketMap['Taxable']||0)/totalAccounts*100)} of accounts</div></div>
        <div className="kpi"><div className="kpi-lbl">Tax-Deferred (IRA)</div><div className="kpi-val">{fmt.dollar(bucketMap['Tax-Deferred']||0)}</div><div className="kpi-sub">IRA + 401k</div></div>
      </div>
      <div className="mb18">
        <div className="alert a-red"><span>⚠️</span><div><strong>Concentration Risk:</strong> STT is ~8% of your portfolio — employer-stock single-name risk. Recommend sell-on-vest into VOO.</div></div>
        <div className="alert a-amber"><span>💡</span><div><strong>Income ETF Tax Drag:</strong> JEPQ + JEPI in taxable accounts generate ordinary income. Consider repositioning to IRA.</div></div>
        <div className="alert a-blue"><span>📊</span><div><strong>Idle Cash:</strong> $1.78M in bank accounts. T-bills yield ~5.2% — deploying adds ~$40K/yr risk-free.</div></div>
      </div>
      <div className="g2 mb18">
        <div className="card">
          <div className="card-hdr"><div><div className="card-title">Sector Allocation</div><div className="card-sub">By estimated sector</div></div></div>
          <div className="ch-wrap ch-md"><Doughnut data={{ labels:sectors.slice(0,10).map(s=>s.sector), datasets:[{data:sectors.slice(0,10).map(s=>s.value),backgroundColor:colors,borderWidth:2,borderColor:'#fff'}] }} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:10.5},boxWidth:11}},tooltip:{callbacks:{label:c=>` ${fmt.pct(c.raw/totalInv*100)} — ${fmt.dollar(c.raw)}`}}}}} /></div>
        </div>
        <div className="card">
          <div className="card-hdr"><div><div className="card-title">Top 10 Holdings</div><div className="card-sub">By market value</div></div></div>
          <div className="ch-wrap ch-md"><Bar data={{ labels:topH.slice(0,10).map(h=>h.ticker), datasets:[{data:topH.slice(0,10).map(h=>h.value),backgroundColor:'#c8a84b88',borderColor:'#c8a84b',borderWidth:1}] }} options={{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{callback:v=>fmt.dollar(v),font:{size:10}}}}}} /></div>
        </div>
      </div>
      <div className="card">
        <div className="card-hdr"><div className="card-title">Top Holdings</div><span className="bdg bdg-blue">{topH.length} positions</span></div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Ticker</th><th>Name</th><th className="r">Value</th><th className="r">Weight</th></tr></thead>
            <tbody>{topH.map((h,i)=><tr key={i}><td><span className="tkr">{h.ticker}</span></td><td className="txt">{h.name}</td><td className="r">{fmt.dollar(h.value)}</td><td className="r">{fmt.pct(h.pct)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
