import { useEffect, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { api, fmt } from '../api';

export default function TaxBuckets() {
  const [buckets,  setBuckets]  = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([api.getBuckets(), api.getAccounts()])
      .then(([b,a])=>{setBuckets(b);setAccounts(a);setLoading(false);})
      .catch(()=>setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading tax buckets…</div>;
  const total = buckets.reduce((s,b)=>s+parseFloat(b.total),0);
  const recs = [
    {p:'🔴 High',t:'Reposition JEPQ/JEPI → IRA',d:'$2.28M in covered-call ETFs in taxable accounts. Moving to IRA saves est. $24K–$32K/yr in federal taxes.'},
    {p:'🔴 High',t:"Tax-Gain Harvest in Daughter's Account",d:"Kavya is likely in the 0% LTCG bracket in 2026. Sell and repurchase appreciated positions — resets cost basis at $0 federal tax."},
    {p:'🟡 Medium',t:'STT Vest → Immediate Sale into VOO',d:'Each RSU vest is ordinary income. Immediately selling into VOO swaps single-stock risk for S&P 500 growth.'},
    {p:'🟡 Medium',t:'Max 2026 IRA Contributions',d:'$8,000/person (50+). At 7% growth, $8K/yr compounds to ~$430K over 20 years.'},
    {p:'🟢 Low',t:'T-Bills vs. Bank Savings (NJ Benefit)',d:'T-bill interest exempt from NJ state income tax (6.37%). ~$57K more in interest income vs. savings accounts.'}
  ];
  const bucketBadge = {'Taxable':'bdg-red','Tax-Deferred':'bdg-blue','Tax-Free / Tax-Advantaged':'bdg-sage'};

  return (
    <div>
      <div className="stitle">Tax Buckets <small>Asset location analysis</small></div>
      <div className="g2 mb18">
        <div className="card">
          <div className="card-title">Tax Bucket Breakdown</div>
          <div className="ch-wrap ch-md"><Doughnut data={{labels:buckets.map(b=>b.tax_bucket.replace('Tax-Free / Tax-Advantaged','Tax-Free')),datasets:[{data:buckets.map(b=>b.total),backgroundColor:['#b52d2d','#1e56a0','#3d6b35'],borderWidth:3,borderColor:'#fff'}]}} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11.5}}},tooltip:{callbacks:{label:c=>` ${fmt.dollar(c.raw)} (${((c.raw/total)*100).toFixed(1)}%)`}}}}}/></div>
        </div>
        <div className="card">
          <div className="card-title">Tax Optimization Recommendations</div>
          {recs.map((r,i)=><div key={i} style={{padding:'11px 0',borderBottom:i<recs.length-1?'1px solid var(--border)':'none'}}><div style={{display:'flex',gap:8,alignItems:'center',marginBottom:4}}><span style={{fontSize:12}}>{r.p}</span><strong style={{fontSize:12.5}}>{r.t}</strong></div><div style={{fontSize:12,color:'var(--muted)',lineHeight:1.6}}>{r.d}</div></div>)}
        </div>
      </div>
      <div className="card">
        <div className="card-title">Account-Level Tax Breakdown</div>
        <div className="tbl-wrap"><table><thead><tr><th>Institution</th><th>Account</th><th>Type</th><th>Bucket</th><th className="r">Balance</th><th className="r">%</th></tr></thead>
        <tbody>{accounts.filter(a=>parseFloat(a.balance)>0).sort((a,b)=>b.balance-a.balance).map(a=><tr key={a.id}><td className="txt">{a.institution}</td><td className="txt">{a.account_name.replace(/Ending in /g,'···')}</td><td className="txt">{a.account_type}</td><td><span className={`bdg ${bucketBadge[a.tax_bucket]||'bdg-gold'}`}>{a.tax_bucket.replace('Tax-Free / Tax-Advantaged','Tax-Free')}</span></td><td className="r">{fmt.dollar(a.balance)}</td><td className="r">{fmt.pct(parseFloat(a.balance)/total*100)}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
}
