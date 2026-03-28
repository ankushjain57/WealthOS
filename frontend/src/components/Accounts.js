import { useEffect, useState } from 'react';
import { api, fmt } from '../api';

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [form, setForm] = useState({institution:'',account_name:'',balance:'',tax_bucket:'Taxable',account_type:''});
  const [msg, setMsg]   = useState('');

  function load() { api.getAccounts().then(a=>{setAccounts(a);setLoading(false);}).catch(()=>setLoading(false)); }
  useEffect(load, []);

  async function addAccount() {
    if (!form.institution||!form.balance){setMsg('Institution and balance required.');return;}
    try { await api.addAccount(form); setMsg('✅ Account added'); setForm({institution:'',account_name:'',balance:'',tax_bucket:'Taxable',account_type:''}); load(); }
    catch(e){setMsg('Error: '+e.message);}
  }
  async function deleteAccount(id) { if(!window.confirm('Remove this account?'))return; await api.deleteAccount(id); load(); }

  if (loading) return <div className="loading">Loading accounts…</div>;
  const total = accounts.reduce((s,a)=>s+parseFloat(a.balance),0);
  const bucketTotals = {};
  accounts.forEach(a=>{bucketTotals[a.tax_bucket]=(bucketTotals[a.tax_bucket]||0)+parseFloat(a.balance);});
  const bucketBadge = {'Taxable':'bdg-red','Tax-Deferred':'bdg-blue','Tax-Free / Tax-Advantaged':'bdg-sage'};

  return (
    <div>
      <div className="stitle">Accounts <small>{accounts.length} accounts · {fmt.dollar(total)}</small></div>
      <div className="g3 mb18">{Object.entries(bucketTotals).map(([bucket,val])=><div key={bucket} className="kpi"><div className="kpi-lbl">{bucket.replace('Tax-Free / Tax-Advantaged','Tax-Free')}</div><div className="kpi-val">{fmt.dollar(val)}</div><div className="kpi-sub">{fmt.pct(val/total*100)} of total</div></div>)}</div>
      <div className="card mb18">
        <div className="card-title">All Accounts</div>
        <div className="tbl-wrap"><table><thead><tr><th>Institution</th><th>Account</th><th>Type</th><th>Bucket</th><th className="r">Balance</th><th className="r">%</th><th></th></tr></thead>
        <tbody>{accounts.map(a=><tr key={a.id}><td className="txt">{a.institution}</td><td className="txt">{a.account_name.replace(/Ending in /g,'···')}</td><td className="txt">{a.account_type}</td><td><span className={`bdg ${bucketBadge[a.tax_bucket]||'bdg-gold'}`}>{a.tax_bucket.replace('Tax-Free / Tax-Advantaged','Tax-Free')}</span></td><td className="r">{fmt.dollar(a.balance)}</td><td className="r">{fmt.pct(parseFloat(a.balance)/total*100)}</td><td><button style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}} onClick={()=>deleteAccount(a.id)}>✕</button></td></tr>)}</tbody></table></div>
      </div>
      <div className="card">
        <div className="card-title">Add Account Manually</div>
        <div className="g3" style={{marginBottom:14}}>
          <div className="fg"><label>Institution</label><input value={form.institution} onChange={e=>setForm({...form,institution:e.target.value})} placeholder="e.g. Fidelity"/></div>
          <div className="fg"><label>Account Name</label><input value={form.account_name} onChange={e=>setForm({...form,account_name:e.target.value})} placeholder="e.g. Roth IRA"/></div>
          <div className="fg"><label>Balance ($)</label><input type="number" value={form.balance} onChange={e=>setForm({...form,balance:e.target.value})} placeholder="0.00"/></div>
          <div className="fg"><label>Tax Bucket</label><select value={form.tax_bucket} onChange={e=>setForm({...form,tax_bucket:e.target.value})}><option>Taxable</option><option>Tax-Deferred</option><option>Tax-Free / Tax-Advantaged</option></select></div>
          <div className="fg"><label>Account Type</label><input value={form.account_type} onChange={e=>setForm({...form,account_type:e.target.value})} placeholder="e.g. Roth IRA"/></div>
        </div>
        <button className="btn btn-ink" onClick={addAccount}>Add Account</button>
        {msg&&<div style={{marginTop:10,fontSize:12.5,color:msg.startsWith('✅')?'var(--sage)':'var(--red)'}}>{msg}</div>}
      </div>
    </div>
  );
}
