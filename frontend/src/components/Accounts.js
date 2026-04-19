import { useEffect, useState } from 'react';
import { api, fmt } from '../api';

const ACCOUNT_TYPES = ['Brokerage', 'Managed', 'Manual', 'Cash/CD', 'Cash', '529', 'Brokerage/IRA', '401K/403b', 'EmployeeStock', 'Managed/IRA', 'Real Estate', 'Other'];

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [sort, setSort] = useState({ col: 'balance', dir: 'desc' });
  const [form, setForm] = useState({institution:'',account_name:'',balance:'',tax_bucket:'Taxable',account_type:'',product_type:''});
  const [msg, setMsg]   = useState('');

  function load() { api.getAccounts().then(a=>{setAccounts(a);setLoading(false);}).catch(()=>setLoading(false)); }
  useEffect(load, []);

  async function addAccount() {
    if (!form.institution||!form.balance){setMsg('Institution and balance required.');return;}
    try { await api.addAccount(form); setMsg('✅ Account added'); setForm({institution:'',account_name:'',balance:'',tax_bucket:'Taxable',account_type:'',product_type:''}); load(); }
    catch(e){setMsg('Error: '+e.message);}
  }
  async function deleteAccount(id) { if(!window.confirm('Remove this account?'))return; await api.deleteAccount(id); load(); }

  if (loading) return <div className="loading">Loading accounts…</div>;
  const total = accounts.reduce((s,a)=>s+parseFloat(a.balance),0);
  const bucketTotals = {};
  accounts.forEach(a=>{bucketTotals[a.tax_bucket]=(bucketTotals[a.tax_bucket]||0)+parseFloat(a.balance);});
  const bucketBadge = {'Taxable':'bdg-red','Tax-Deferred':'bdg-blue','Tax-Free / Tax-Advantaged':'bdg-sage'};

  const toggleSort = (col) => {
    setSort(prev => ({ col, dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc' }));
  };

  const SortTh = ({ col, label, align }) => {
    const active = sort.col === col;
    return (
      <th
        className={align === 'r' ? 'r' : ''}
        style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}
        onClick={() => toggleSort(col)}
      >
        {label}{' '}
        <span style={{ opacity: active ? 1 : 0.25, fontSize: 9 }}>
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '▾'}
        </span>
      </th>
    );
  };

  const sortedAccounts = [...accounts].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const av = sort.col === 'balance' ? parseFloat(a.balance) : (a[sort.col] || '');
    const bv = sort.col === 'balance' ? parseFloat(b.balance) : (b[sort.col] || '');
    if (sort.col === 'balance') return dir * (av - bv);
    return dir * String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
  });

  return (
    <div>
      <div className="stitle">Accounts <small>{accounts.length} accounts · {fmt.dollar(total)}</small></div>
      <div className="g3 mb18">{Object.entries(bucketTotals).map(([bucket,val])=><div key={bucket} className="kpi"><div className="kpi-lbl">{bucket.replace('Tax-Free / Tax-Advantaged','Tax-Free')}</div><div className="kpi-val">{fmt.dollar(val)}</div><div className="kpi-sub">{fmt.pct(val/total*100)} of total</div></div>)}</div>
      <div className="card mb18">
        <div className="card-title">All Accounts</div>
        <div className="tbl-wrap"><table><thead><tr><SortTh col="institution" label="Institution" /><SortTh col="account_name" label="Account" /><SortTh col="account_type" label="Type" /><SortTh col="product_type" label="Product" /><SortTh col="tax_bucket" label="Bucket" /><SortTh col="balance" label="Balance" align="r" /><th className="r">%</th><th></th></tr></thead>
        <tbody>{sortedAccounts.map(a=><tr key={a.id}><td className="txt">{a.institution}</td><td className="txt">{a.account_name.replace(/Ending in /g,'···')}</td><td className="txt">{a.account_type}</td><td className="txt">{a.product_type||'—'}</td><td><span className={`bdg ${bucketBadge[a.tax_bucket]||'bdg-gold'}`}>{a.tax_bucket.replace('Tax-Free / Tax-Advantaged','Tax-Free')}</span></td><td className="r">{fmt.dollar(a.balance)}</td><td className="r">{fmt.pct(parseFloat(a.balance)/total*100)}</td><td><button style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}} onClick={()=>deleteAccount(a.id)}>✕</button></td></tr>)}</tbody></table></div>
      </div>
      <div className="card">
        <div className="card-title">Add Account Manually</div>
        <div className="g3" style={{marginBottom:14}}>
          <div className="fg"><label>Institution</label><input value={form.institution} onChange={e=>setForm({...form,institution:e.target.value})} placeholder="e.g. Fidelity"/></div>
          <div className="fg"><label>Account Name</label><input value={form.account_name} onChange={e=>setForm({...form,account_name:e.target.value})} placeholder="e.g. Roth IRA"/></div>
          <div className="fg"><label>Balance ($)</label><input type="number" value={form.balance} onChange={e=>setForm({...form,balance:e.target.value})} placeholder="0.00"/></div>
          <div className="fg"><label>Tax Bucket</label><select value={form.tax_bucket} onChange={e=>setForm({...form,tax_bucket:e.target.value})}><option>Taxable</option><option>Tax-Deferred</option><option>Tax-Free / Tax-Advantaged</option></select></div>
          <div className="fg"><label>Account Type</label><input value={form.account_type} onChange={e=>setForm({...form,account_type:e.target.value})} placeholder="e.g. Roth IRA" list="account-type-options"/></div>
          <datalist id="account-type-options">
            {ACCOUNT_TYPES.map(t => <option key={t} value={t} />)}
          </datalist>
          <div className="fg"><label>Product Type</label><input value={form.product_type} onChange={e=>setForm({...form,product_type:e.target.value})} placeholder="e.g. Cash or CD"/></div>
        </div>
        <button className="btn btn-ink" onClick={addAccount}>Add Account</button>
        {msg&&<div style={{marginTop:10,fontSize:12.5,color:msg.startsWith('✅')?'var(--sage)':'var(--red)'}}>{msg}</div>}
      </div>
    </div>
  );
}
