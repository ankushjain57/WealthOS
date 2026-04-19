import { useEffect, useState } from 'react';
import { api, fmt } from '../api';

const EMPTY = { ticker:'', name:'', account_name:'Manual', account_type:'', product_type:'', shares:'', price:'' };

const ACCOUNT_TYPES = ['Brokerage', 'Managed', 'Manual', 'Cash/CD', 'Cash', '529', 'Brokerage/IRA', '401K/403b', 'EmployeeStock', 'Managed/IRA', 'Real Estate', 'Other'];
const PRODUCT_TYPES = ['Stock', 'ETF', 'Bond', 'Mutual Fund', 'Option', 'Cash', 'Real Estate', 'CD', 'Annuity', 'Other'];

const EMPTY_ACCOUNT = { institution:'', account_name:'', balance:'', tax_bucket:'Taxable', account_type:'', product_type:'' };

function HoldingModal({ initial, onSave, onClose, accountSuggestions }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(
    initial
      ? { ticker: initial.ticker, name: initial.name, account_name: initial.account_name || '', account_type: initial.account_type || '', product_type: initial.product_type || '', shares: initial.shares, price: initial.price }
      : EMPTY
  );
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const value = (parseFloat(form.shares) || 0) * (parseFloat(form.price) || 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.ticker || !form.shares || !form.price) { setErr('Ticker, shares and price are required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { ticker: form.ticker, name: form.name || form.ticker, account_name: form.account_name || 'Manual', account_type: form.account_type || '', product_type: form.product_type || '', shares: form.shares, price: form.price };
      const result = isEdit ? await api.updateHolding(initial.id, payload) : await api.addHolding(payload);
      if (result.error) { setErr(result.error); setSaving(false); return; }
      onSave();
    } catch (ex) { setErr(ex.message); setSaving(false); }
  }

  const overlay = { position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center' };
  const box     = { background:'var(--surface)',borderRadius:12,padding:28,width:460,maxWidth:'95vw',boxShadow:'0 8px 40px rgba(0,0,0,0.22)' };
  const inp     = { width:'100%',padding:'8px 11px',border:'1px solid var(--border)',borderRadius:6,fontSize:13,outline:'none',boxSizing:'border-box',background:'var(--surface)',color:'var(--ink)' };
  const lbl     = { display:'block',fontSize:11.5,fontWeight:600,color:'var(--muted)',marginBottom:4 };

  return (
    <div style={overlay} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={box}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <span style={{ fontWeight:700, fontSize:15 }}>{isEdit ? 'Edit Holding' : 'Add Holding'}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--muted)' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          {/* Account row — full width */}
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Account *</label>
            <input
              style={inp} value={form.account_name}
              onInput={e=>set('account_name',e.target.value)}
              placeholder="e.g. Select UMA IRA - 9855 or Real Estate 1"
              list="acct-suggestions"
            />
            <datalist id="acct-suggestions">
              {(accountSuggestions||[]).map(a=><option key={a} value={a}/>)}
            </datalist>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label style={lbl}>Ticker *</label>
              <input style={inp} value={form.ticker} onInput={e=>set('ticker',e.target.value.toUpperCase())} placeholder="e.g. AAPL" />
            </div>
            <div>
              <label style={lbl}>Name</label>
              <input style={inp} value={form.name} onInput={e=>set('name',e.target.value)} placeholder="Auto-filled on refresh" />
            </div>
            <div>
              <label style={lbl}>Account Type</label>
              <select style={inp} value={form.account_type} onChange={e=>set('account_type',e.target.value)}>
                <option value="">— Select —</option>
                {ACCOUNT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Product</label>
              <select style={inp} value={form.product_type} onChange={e=>set('product_type',e.target.value)}>
                <option value="">— Select —</option>
                {PRODUCT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Shares *</label>
              <input style={inp} type="number" step="any" min="0" value={form.shares} onInput={e=>set('shares',e.target.value)} placeholder="0" />
            </div>
            <div>
              <label style={lbl}>Price ($) *</label>
              <input style={inp} type="number" step="any" min="0" value={form.price} onInput={e=>set('price',e.target.value)} placeholder="0.00" />
            </div>
          </div>
          {value > 0 && (
            <div style={{ background:'rgba(201,168,76,0.10)', border:'1px solid rgba(201,168,76,0.3)', borderRadius:6, padding:'7px 11px', fontSize:13, marginBottom:12 }}>
              Market value: <strong>{fmt.dollar(value)}</strong>
            </div>
          )}
          {err && <div style={{ color:'#c0392b', fontSize:12.5, marginBottom:10 }}>{err}</div>}
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-sm" disabled={saving} style={{ background:'var(--gold)', color:'#1a1a1a', border:'none', fontWeight:600 }}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Holding'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AccountModal({ initial, onSave, onClose }) {
  const isEdit = !!initial?.accountId;
  const [form, setForm] = useState(
    initial
      ? {
          institution: initial.account_name || '',
          account_name: initial.name || '',
          balance: initial.value ?? '',
          tax_bucket: initial.tax_bucket || 'Taxable',
          account_type: initial.account_type || '',
          product_type: initial.product_type || ''
        }
      : EMPTY_ACCOUNT
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.institution || form.balance === '' || Number.isNaN(parseFloat(form.balance))) {
      setErr('Institution and valid balance are required.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const payload = {
        institution: form.institution,
        account_name: form.account_name,
        balance: form.balance,
        tax_bucket: form.tax_bucket,
        account_type: form.account_type,
        product_type: form.product_type
      };
      const result = await api.updateAccount(initial.accountId, payload);
      if (result.error) {
        setErr(result.error);
        setSaving(false);
        return;
      }
      onSave();
    } catch (ex) {
      setErr(ex.message);
      setSaving(false);
    }
  }

  const overlay = { position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center' };
  const box     = { background:'var(--surface)',borderRadius:12,padding:28,width:460,maxWidth:'95vw',boxShadow:'0 8px 40px rgba(0,0,0,0.22)' };
  const inp     = { width:'100%',padding:'8px 11px',border:'1px solid var(--border)',borderRadius:6,fontSize:13,outline:'none',boxSizing:'border-box',background:'var(--surface)',color:'var(--ink)' };
  const lbl     = { display:'block',fontSize:11.5,fontWeight:600,color:'var(--muted)',marginBottom:4 };

  return (
    <div style={overlay} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={box}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <span style={{ fontWeight:700, fontSize:15 }}>{isEdit ? 'Edit Account Balance' : 'Edit Account'}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--muted)' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label style={lbl}>Institution *</label>
              <input style={inp} value={form.institution} onInput={e=>set('institution',e.target.value)} placeholder="e.g. Goldman Sachs" />
            </div>
            <div>
              <label style={lbl}>Account Name</label>
              <input style={inp} value={form.account_name} onInput={e=>set('account_name',e.target.value)} placeholder="e.g. Marcus Savings" />
            </div>
            <div>
              <label style={lbl}>Balance ($) *</label>
              <input style={inp} type="number" step="any" min="0" value={form.balance} onInput={e=>set('balance',e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label style={lbl}>Account Type</label>
              <select style={inp} value={form.account_type} onChange={e=>set('account_type',e.target.value)}>
                <option value="">— Select —</option>
                {ACCOUNT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Product Type</label>
              <select style={inp} value={form.product_type} onChange={e=>set('product_type',e.target.value)}>
                <option value="">— Select —</option>
                {PRODUCT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ gridColumn:'1 / span 2' }}>
              <label style={lbl}>Tax Bucket</label>
              <select style={inp} value={form.tax_bucket} onChange={e=>set('tax_bucket',e.target.value)}>
                <option>Taxable</option>
                <option>Tax-Deferred</option>
                <option>Tax-Free / Tax-Advantaged</option>
              </select>
            </div>
          </div>
          {err && <div style={{ color:'#c0392b', fontSize:12.5, marginBottom:10 }}>{err}</div>}
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-sm" disabled={saving} style={{ background:'var(--gold)', color:'#1a1a1a', border:'none', fontWeight:600 }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Portfolio() {
  const [holdings,    setHoldings]   = useState([]);
  const [accounts,    setAccounts]   = useState([]);
  const [search,      setSearch]     = useState('');
  const [tableSort,   setTableSort]  = useState({ col: 'value', dir: 'desc' });
  const [groupBy,     setGroupBy]    = useState(false);
  const [loading,     setLoading]    = useState(true);
  const [page,        setPage]       = useState(1);
  const [refreshing,  setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt]= useState(null);
  const [refreshMsg,  setRefreshMsg] = useState(null);
  const [modal,       setModal]      = useState(null);
  const [accountModal,setAccountModal]= useState(null);
  const [delConfirm,  setDelConfirm] = useState(null);
  const [selected,    setSelected]   = useState([]);
  const [lastIdx,     setLastIdx]    = useState(null);
  const [bulkEdit,    setBulkEdit]   = useState({ account_type:'', product_type:'', account_name:'' });
  const [bulkSaving,  setBulkSaving] = useState(false);
  const PER = 25;

  function loadAll() {
    return Promise.all([api.getHoldings(), api.getAccounts()])
      .then(([h, a]) => { setHoldings(h); setAccounts(a); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(() => { loadAll(); }, []);

  async function handleRefresh() {
    setRefreshing(true); setRefreshMsg(null);
    try {
      const result = await api.refreshPrices();
      await loadAll();
      setRefreshedAt(new Date(result.refreshed_at));
      const failNote = result.failed?.length ? ` (${result.failed.join(', ')} not found)` : '';
      setRefreshMsg({ type:'ok', text:`Updated ${result.updated} of ${result.total} holdings${failNote}` });
    } catch (err) {
      setRefreshMsg({ type:'err', text:'Price refresh failed: '+err.message });
    } finally { setRefreshing(false); }
  }

  async function handleDelete() {
    if (!delConfirm) return;
    try {
      if (delConfirm.kind === 'holding') {
        await api.deleteHolding(delConfirm.id);
      } else {
        await api.deleteAccount(delConfirm.id);
      }
      setDelConfirm(null);
      await loadAll();
    } catch (err) {
      setRefreshMsg({ type:'err', text:'Delete failed: ' + err.message });
    }
  }

  function handleRowSelect(id, idx, e, visibleRows) {
    setSelected(prev => {
      if (e.shiftKey && lastIdx !== null) {
        const lo = Math.min(lastIdx, idx);
        const hi = Math.max(lastIdx, idx);
        const rangeIds = visibleRows.slice(lo, hi + 1).map(r => r.id);
        const merged = [...new Set([...prev, ...rangeIds])];
        return merged;
      } else if (e.ctrlKey || e.metaKey) {
        return prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      } else {
        return prev.length === 1 && prev[0] === id ? [] : [id];
      }
    });
    setLastIdx(idx);
  }

  async function handleBulkApply() {
    const holdingUpdates = {};
    const accountUpdates = {};
    if (bulkEdit.account_type) {
      holdingUpdates.account_type = bulkEdit.account_type;
      accountUpdates.account_type = bulkEdit.account_type;
    }
    if (bulkEdit.product_type) {
      holdingUpdates.product_type = bulkEdit.product_type;
      accountUpdates.product_type = bulkEdit.product_type;
    }
    if (bulkEdit.account_name.trim()) holdingUpdates.account_name = bulkEdit.account_name.trim();
    if (!Object.keys(holdingUpdates).length && !Object.keys(accountUpdates).length) return;
    setBulkSaving(true);
    try {
      const selectedHoldings = selected
        .filter(id => String(id).startsWith('h:'))
        .map(id => Number(String(id).slice(2)));
      const selectedAccounts = selected
        .filter(id => String(id).startsWith('a:'))
        .map(id => Number(String(id).slice(2)));

      await Promise.all([
        ...selectedHoldings.map(id => {
          const h = holdings.find(x => x.id === id);
          if (!h) return null;
          return api.updateHolding(id, { ...h, ...holdingUpdates });
        }),
        ...selectedAccounts.map(id => {
          const a = standaloneAccts.find(x => x.id === id);
          if (!a) return null;
          return api.updateAccount(id, {
            institution: a.institution,
            account_name: a.account_name,
            balance: a.balance,
            tax_bucket: a.tax_bucket,
            account_type: accountUpdates.account_type ?? a.account_type,
            product_type: accountUpdates.product_type ?? a.product_type,
          });
        })
      ]);
      setSelected([]);
      setBulkEdit({ account_type:'', product_type:'', account_name:'' });
      await loadAll();
      const totalUpdated = selectedHoldings.length + selectedAccounts.length;
      setRefreshMsg({ type:'ok', text:`Updated ${totalUpdated} row${totalUpdated!==1?'s':''}` });
    } catch (err) {
      setRefreshMsg({ type:'err', text:'Bulk update failed: ' + err.message });
    } finally { setBulkSaving(false); }
  }

  // MS/Fidelity/E*TRADE accounts already have individual holdings — don't show as standalone rows
  const INVEST_INST = ['morgan stanley', 'fidelity', 'e*trade'];
  const standaloneAccts = accounts.filter(a =>
    !INVEST_INST.some(k => (a.institution||'').toLowerCase().includes(k))
  );

  // Normalize account entries into holding-like rows for unified display
  const acctRows = standaloneAccts.map(a => ({
    _isAccount: true,
    id: `acct-${a.id}`,
    accountId: a.id,
    ticker: null,
    name: a.account_name,
    account_name: a.institution,
    shares: null,
    price: null,
    change_pct: null,
    day1_change: 0,
    value: parseFloat(a.balance),
    account_type: a.account_type,
    product_type: a.product_type,
    tax_bucket: a.tax_bucket,
  }));

  // Autocomplete includes both holdings account_names and institution names
  const accountSuggestions = [...new Set([
    'Manual',
    ...holdings.map(h => h.account_name).filter(Boolean),
    ...standaloneAccts.map(a => a.institution).filter(Boolean),
  ])].sort();

  const holdingsTotal = holdings.reduce((s,h) => s + parseFloat(h.value), 0);
  const acctTotal     = standaloneAccts.reduce((s,a) => s + parseFloat(a.balance), 0);
  const grandTotal    = holdingsTotal + acctTotal;

  function toggleTableSort(col) {
    setTableSort(prev => ({ col, dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc' }));
    setPage(1);
  }

  function getSortableValue(row, col) {
    switch (col) {
      case 'account': return row.account_name || '';
      case 'ticker':  return row.ticker || row.account_type || '';
      case 'name':    return row.name || '';
      case 'shares':  return parseFloat(row.shares) || 0;
      case 'price':   return parseFloat(row.price) || 0;
      case 'chg':     return parseFloat(row.change_pct) || 0;
      case 'day1':    return parseFloat(row.day1_change) || 0;
      case 'value':   return parseFloat(row.value) || 0;
      case 'weight':  return grandTotal > 0 ? (parseFloat(row.value) || 0) / grandTotal * 100 : 0;
      default:        return '';
    }
  }

  function sortRows(rows) {
    const dir = tableSort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getSortableValue(a, tableSort.col);
      const bv = getSortableValue(b, tableSort.col);
      if (typeof av === 'string' || typeof bv === 'string') {
        return dir * String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      }
      return dir * (av - bv);
    });
  }

  let filteredH = holdings.filter(h =>
    h.ticker.toLowerCase().includes(search.toLowerCase()) ||
    h.name.toLowerCase().includes(search.toLowerCase()) ||
    (h.account_name||'').toLowerCase().includes(search.toLowerCase())
  );

  const filteredA = acctRows.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.account_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.account_type||'').toLowerCase().includes(search.toLowerCase())
  );

  const isCashProductType = (p) => {
    const t = (p || '').toLowerCase().trim();
    return t === 'cash' || t === 'cd';
  };

  const filteredCashA = filteredA.filter(r => isCashProductType(r.product_type));
  const filteredInvestA = filteredA.filter(r => !isCashProductType(r.product_type));

  const sortedH = sortRows(filteredH);
  const sortedA = sortRows(filteredA);
  const sortedCashA = sortRows(filteredCashA);
  const sortedInvestA = sortRows(filteredInvestA);

  const pages   = Math.ceil(sortedH.length/PER);
  const visible = sortedH.slice((page-1)*PER, page*PER);

  // Group holdings by account_name
  const grouped = {};
  if (groupBy) {
    sortedH.forEach(h => {
      const key = h.account_name || '(No Account)';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(h);
    });
  }

  function exportCSV() {
    const lines = ['Account,Ticker,Name,Shares,Price,Change%,1-Day$,Value'];
    holdings.forEach(h => lines.push(`"${h.account_name||''}",${h.ticker},"${h.name}",${h.shares},${h.price},${h.change_pct},${h.day1_change},${h.value}`));
    standaloneAccts.forEach(a => lines.push(`"${a.institution}","${a.account_name}","${a.account_name}",,,,,${a.balance}`));
    const el = document.createElement('a');
    el.href = URL.createObjectURL(new Blob([lines.join('\n')], {type:'text/csv'}));
    el.download = 'wealthos_holdings.csv'; el.click();
  }

  // Unified table — renders both security holdings and account balance rows
  const SortTh = ({ col, label, align }) => {
    const active = tableSort.col === col;
    return (
      <th
        className={align === 'r' ? 'r' : ''}
        style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}
        onClick={() => toggleTableSort(col)}
      >
        {label}{' '}
        <span style={{ opacity: active ? 1 : 0.25, fontSize: 9 }}>
          {active ? (tableSort.dir === 'asc' ? '▲' : '▼') : '▾'}
        </span>
      </th>
    );
  };

  const HoldingsTable = ({ rows = [], extraAccts = [], visibleRows = [] }) => {
    const holdingIds = rows.map(h => `h:${h.id}`);
    const acctIds = extraAccts.map(a => `a:${a.accountId}`);
    const allIds = [...holdingIds, ...acctIds];
    const allChecked = allIds.length > 0 && allIds.every(id => selected.includes(id));
    const someChecked = allIds.some(id => selected.includes(id));
    function toggleAll(e) {
      setSelected(prev => {
        if (e.target.checked) return [...new Set([...prev, ...allIds])];
        return prev.filter(id => !allIds.includes(id));
      });
    }
    return (
    <table>
      <thead>
        <tr>
          <th style={{ width:28, paddingRight:4 }}>
            <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} style={{ cursor:'pointer' }} />
          </th>
          <SortTh col="account" label="Account" />
          <SortTh col="acctType" label="Type" />
          <SortTh col="ticker" label="Ticker" />
          <SortTh col="product" label="Product" />
          <SortTh col="name" label="Name" />
          <SortTh col="shares" label="Shares" align="r" />
          <SortTh col="price" label="Price" align="r" />
          <SortTh col="chg" label="Chg%" align="r" />
          <SortTh col="day1" label="1-Day $" align="r" />
          <SortTh col="value" label="Value" align="r" />
          <SortTh col="weight" label="Wt%" align="r" />
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h, idx) => {
          const selId = `h:${h.id}`;
          const isSel = selected.includes(selId);
          return (
          <tr key={h.id}
            style={{ background: isSel ? 'rgba(201,168,76,0.13)' : undefined, cursor:'pointer' }}
            onClick={e => { if (e.target.type === 'checkbox' || e.target.tagName === 'BUTTON') return; handleRowSelect(selId, idx, e, visibleRows.length ? visibleRows.map(r => ({...r, id:`h:${r.id}`})) : rows.map(r => ({...r, id:`h:${r.id}`}))); }}>
            <td style={{ paddingRight:4 }} onClick={e=>e.stopPropagation()}>
              <input type="checkbox" checked={isSel} onChange={e => {
                setSelected(prev => e.target.checked ? [...new Set([...prev, selId])] : prev.filter(x => x !== selId));
                setLastIdx(idx);
              }} style={{ cursor:'pointer' }} />
            </td>
            <td style={{ fontSize:11.5, color:'var(--muted)', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.account_name || '—'}</td>
            <td style={{ fontSize:11.5, color:'var(--muted)' }}>{h.account_type || '—'}</td>
            <td><span className="tkr">{h.ticker}</span></td>
            <td style={{ fontSize:11.5, color:'var(--muted)' }}>{h.product_type || '—'}</td>
            <td className="txt">{h.name}</td>
            <td className="r">{parseFloat(h.shares).toLocaleString(undefined,{maximumFractionDigits:2})}</td>
            <td className="r">{fmt.dollar(h.price)}</td>
            <td className={`r ${parseFloat(h.change_pct)>=0?'pos':'neg'}`}>{parseFloat(h.change_pct).toFixed(2)}%</td>
            <td className={`r ${parseFloat(h.day1_change)>=0?'pos':'neg'}`}>{fmt.sign(parseFloat(h.day1_change))}</td>
            <td className="r">{fmt.dollar(h.value)}</td>
            <td className="r">{fmt.pct(parseFloat(h.value)/grandTotal*100)}</td>
            <td style={{ whiteSpace:'nowrap', paddingLeft:6 }}>
              <button onClick={()=>setModal(h)} style={{ fontSize:11,padding:'2px 8px',borderRadius:4,border:'1px solid var(--border)',background:'var(--surface)',cursor:'pointer',color:'var(--ink)',marginRight:4 }} title="Edit holding">Edit</button>
              <button onClick={()=>setDelConfirm({ kind:'holding', id:h.id, label:`${h.ticker} — ${h.name}` })} style={{ fontSize:11,padding:'2px 8px',borderRadius:4,border:'1px solid #f5c6cb',background:'rgba(220,53,69,0.08)',cursor:'pointer',color:'#c0392b' }} title="Delete holding">Del</button>
            </td>
          </tr>
          );
        })}
        {extraAccts.map((r, idx) => {
          const selId = `a:${r.accountId}`;
          const isSel = selected.includes(selId);
          return (
          <tr key={r.id} style={{ background:isSel ? 'rgba(201,168,76,0.13)' : 'rgba(201,168,76,0.04)', cursor:'pointer' }}
            onClick={e => { if (e.target.type === 'checkbox' || e.target.tagName === 'BUTTON') return; handleRowSelect(selId, idx, e, extraAccts.map(a => ({ ...a, id:`a:${a.accountId}` }))); }}>
            <td onClick={e=>e.stopPropagation()}>
              <input type="checkbox" checked={isSel} onChange={e => {
                setSelected(prev => e.target.checked ? [...new Set([...prev, selId])] : prev.filter(x => x !== selId));
                setLastIdx(idx);
              }} style={{ cursor:'pointer' }} />
            </td>
            <td style={{ fontSize:11.5, color:'var(--muted)', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.account_name}</td>
            <td style={{ fontSize:11.5, color:'var(--muted)' }}>{r.account_type || r.tax_bucket || '—'}</td>
            <td><span style={{ fontSize:10.5, padding:'2px 6px', borderRadius:4, background:'rgba(128,128,128,0.15)', color:'var(--muted)', whiteSpace:'nowrap' }}>—</span></td>
            <td style={{ fontSize:11.5, color:'var(--muted)' }}>{r.product_type || '—'}</td>
            <td className="txt">{r.name}</td>
            <td className="r" style={{color:'var(--muted)'}}>—</td>
            <td className="r" style={{color:'var(--muted)'}}>—</td>
            <td className="r" style={{color:'var(--muted)'}}>—</td>
            <td className="r" style={{color:'var(--muted)'}}>—</td>
            <td className="r">{fmt.dollar(r.value)}</td>
            <td className="r">{fmt.pct(r.value/grandTotal*100)}</td>
            <td style={{ whiteSpace:'nowrap', paddingLeft:6 }}>
              <button onClick={()=>setAccountModal(r)} style={{ fontSize:11,padding:'2px 8px',borderRadius:4,border:'1px solid var(--border)',background:'var(--surface)',cursor:'pointer',color:'var(--ink)',marginRight:4 }} title="Edit account">Edit</button>
              <button onClick={()=>setDelConfirm({ kind:'account', id:r.accountId, label:`${r.account_name} — ${r.name}` })} style={{ fontSize:11,padding:'2px 8px',borderRadius:4,border:'1px solid #f5c6cb',background:'rgba(220,53,69,0.08)',cursor:'pointer',color:'#c0392b' }} title="Delete account">Del</button>
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
    );
  };

  if (loading) return <div className="loading">Loading holdings…</div>;

  const posCount = holdings.length + standaloneAccts.length;

  return (
    <div>
      {/* ── Add / Edit Modal ── */}
      {modal && (
        <HoldingModal
          initial={modal === 'add' ? null : modal}
          onSave={() => { setModal(null); loadAll(); }}
          onClose={() => setModal(null)}
          accountSuggestions={accountSuggestions}
        />
      )}

      {accountModal && (
        <AccountModal
          initial={accountModal}
          onSave={() => { setAccountModal(null); loadAll(); }}
          onClose={() => setAccountModal(null)}
        />
      )}

      {/* ── Delete confirm ── */}
      {delConfirm && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:'var(--surface)',borderRadius:10,padding:24,width:340,textAlign:'center',boxShadow:'0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize:15,fontWeight:700,marginBottom:8 }}>Delete holding?</div>
            <div style={{ fontSize:13,color:'var(--muted)',marginBottom:18 }}>
              {delConfirm?.label}
            </div>
            <div style={{ display:'flex',gap:10,justifyContent:'center' }}>
              <button className="btn btn-outline btn-sm" onClick={()=>setDelConfirm(null)}>Cancel</button>
              <button className="btn btn-sm" onClick={handleDelete}
                style={{ background:'#c0392b',color:'#fff',border:'none',fontWeight:600 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Edit Bar ── */}
      <div style={{ display: selected.length > 0 ? 'flex' : 'none', alignItems:'center',gap:10,flexWrap:'wrap',padding:'10px 14px',marginBottom:12,borderRadius:8,background:'rgba(201,168,76,0.12)',border:'1px solid rgba(201,168,76,0.4)' }}>
          <span style={{ fontWeight:600,fontSize:13 }}>{selected.length} selected</span>
          <span style={{ color:'var(--muted)',fontSize:12 }}>— apply to all:</span>
          <select
            style={{ padding:'5px 10px',border:'1px solid var(--border)',borderRadius:6,fontSize:12.5,background:'var(--surface)' }}
            value={bulkEdit.account_type} onChange={e=>setBulkEdit(b=>({...b,account_type:e.target.value}))}>
            <option value="">Account Type…</option>
            {ACCOUNT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <select
            style={{ padding:'5px 10px',border:'1px solid var(--border)',borderRadius:6,fontSize:12.5,background:'var(--surface)' }}
            value={bulkEdit.product_type} onChange={e=>setBulkEdit(b=>({...b,product_type:e.target.value}))}>
            <option value="">Product Type…</option>
            {PRODUCT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <input
            style={{ padding:'5px 10px',border:'1px solid var(--border)',borderRadius:6,fontSize:12.5,width:160,background:'var(--surface)',color:'var(--ink)' }}
            placeholder="Account name…" value={bulkEdit.account_name}
            onChange={e=>setBulkEdit(b=>({...b,account_name:e.target.value}))}
          />
          <button className="btn btn-sm" onClick={handleBulkApply} disabled={bulkSaving}
            style={{ background:'var(--gold)',color:'#1a1a1a',border:'none',fontWeight:600,minWidth:80 }}>
            {bulkSaving ? 'Saving…' : 'Apply'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={()=>setSelected([])}>Clear</button>
        </div>

      {/* ── Header toolbar ── */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18 }}>
        <div className="stitle" style={{ margin:0 }}>All Holdings <small>{posCount} items · {fmt.dollar(grandTotal)}</small></div>
        <div style={{ display:'flex',gap:10,alignItems:'center',flexWrap:'wrap' }}>
          {refreshedAt && <span style={{ fontSize:11.5,color:'var(--muted)' }}>Live prices as of {refreshedAt.toLocaleTimeString()}</span>}
          <button className="btn btn-outline btn-sm" onClick={handleRefresh} disabled={refreshing} style={{ minWidth:140 }}>
            {refreshing ? '⟳ Refreshing…' : '⟳ Refresh Live Prices'}
          </button>
          <input
            style={{ padding:'8px 13px',border:'1px solid var(--border)',borderRadius:7,fontSize:13,width:200,outline:'none' }}
            placeholder="Search ticker / account…" value={search}
            onChange={e=>{ setSearch(e.target.value); setPage(1); }}
          />
          <select
            style={{ padding:'8px 13px',border:'1px solid var(--border)',borderRadius:7,fontSize:12.5,background:'var(--surface)' }}
            onChange={e=>{
              const v = e.target.value;
              if (v === 'v-d') setTableSort({ col: 'value', dir: 'desc' });
              else if (v === 'v-a') setTableSort({ col: 'value', dir: 'asc' });
              else if (v === 'd-d') setTableSort({ col: 'day1', dir: 'desc' });
              else if (v === 'a-z') setTableSort({ col: 'account', dir: 'asc' });
              else setTableSort({ col: 'ticker', dir: 'asc' });
              setPage(1);
            }}
          >
            <option value="v-d">Value ↓</option>
            <option value="v-a">Value ↑</option>
            <option value="d-d">1-Day ↓</option>
            <option value="t-a">Ticker A–Z</option>
            <option value="a-z">Account A–Z</option>
          </select>
          <button
            className={`btn btn-sm ${groupBy ? '' : 'btn-outline'}`}
            onClick={()=>setGroupBy(g=>!g)}
            style={groupBy ? { background:'var(--gold)',color:'#1a1a1a',border:'none',fontWeight:600 } : {}}
          >
            ⊞ Group by Account
          </button>
          <button className="btn btn-sm" onClick={()=>setModal('add')}
            style={{ background:'var(--gold)',color:'#1a1a1a',border:'none',fontWeight:600 }}>+ Add</button>
          <button className="btn btn-outline btn-sm" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      {refreshMsg && (
        <div style={{ padding:'9px 14px',borderRadius:7,marginBottom:14,fontSize:13,
          background: refreshMsg.type==='ok' ? 'rgba(74,167,65,0.12)' : 'rgba(220,53,69,0.12)',
          color:      refreshMsg.type==='ok' ? '#2d6a27' : '#b02a37',
          border:     `1px solid ${refreshMsg.type==='ok' ? '#a3d9a0' : '#f5c6cb'}` }}>
          {refreshMsg.text}
        </div>
      )}

      {/* ── Group-by-account view ── */}
      {groupBy ? (
        <div>
          {/* Security holdings grouped by account_name */}
          {Object.entries(grouped).map(([acct, rows]) => {
            const gTotal = rows.reduce((s,h)=>s+parseFloat(h.value),0);
            const gDay1  = rows.reduce((s,h)=>s+parseFloat(h.day1_change),0);
            return (
              <div key={acct} className="card" style={{ marginBottom:18 }}>
                <div className="card-hdr" style={{ marginBottom:0 }}>
                  <div>
                    <div className="card-title">{acct}</div>
                    <div className="card-sub">{rows.length} position{rows.length!==1?'s':''} · {fmt.dollar(gTotal)}</div>
                  </div>
                  <span className={gDay1>=0?'pos':'neg'} style={{ fontSize:13,fontWeight:600 }}>{fmt.sign(gDay1)} today</span>
                </div>
                <div className="tbl-wrap" style={{ marginTop:10 }}>
                  <HoldingsTable rows={rows} />
                </div>
              </div>
            );
          })}

          {/* Standalone investment accounts (non Cash/CD) grouped by institution */}
          {(() => {
            const instGroups = {};
            filteredInvestA.forEach(r => {
              if (!instGroups[r.account_name]) instGroups[r.account_name] = [];
              instGroups[r.account_name].push(r);
            });
            return Object.entries(instGroups).map(([inst, rows]) => {
              const iTotal = rows.reduce((s,r)=>s+r.value,0);
              return (
                <div key={`inv-${inst}`} className="card" style={{ marginBottom:18 }}>
                  <div className="card-hdr" style={{ marginBottom:0 }}>
                    <div>
                      <div className="card-title">{inst} (Investment Accounts)</div>
                      <div className="card-sub">{rows.length} account{rows.length!==1?'s':''} · {fmt.dollar(iTotal)}</div>
                    </div>
                  </div>
                  <div className="tbl-wrap" style={{ marginTop:10 }}>
                    <HoldingsTable extraAccts={rows} />
                  </div>
                </div>
              );
            });
          })()}

          {/* Standalone cash/CD accounts grouped by institution */}
          {(() => {
            const instGroups = {};
            filteredCashA.forEach(r => {
              if (!instGroups[r.account_name]) instGroups[r.account_name] = [];
              instGroups[r.account_name].push(r);
            });
            return Object.entries(instGroups).map(([inst, rows]) => {
              const iTotal = rows.reduce((s,r)=>s+r.value,0);
              return (
                <div key={`cash-${inst}`} className="card" style={{ marginBottom:18 }}>
                  <div className="card-hdr" style={{ marginBottom:0 }}>
                    <div>
                      <div className="card-title">{inst} (Cash/CD Accounts)</div>
                      <div className="card-sub">{rows.length} account{rows.length!==1?'s':''} · {fmt.dollar(iTotal)}</div>
                    </div>
                  </div>
                  <div className="tbl-wrap" style={{ marginTop:10 }}>
                    <HoldingsTable extraAccts={rows} />
                  </div>
                </div>
              );
            });
          })()}
        </div>
      ) : (
        /* ── Flat view: securities table + accounts section below ── */
        <div>
          <div className="card" style={{ marginBottom: filteredA.length > 0 ? 18 : 0 }}>
            <div className="tbl-wrap">
              <HoldingsTable rows={visible} />
            </div>
            {pages>1 && (
              <div style={{ display:'flex',gap:5,justifyContent:'flex-end',marginTop:10 }}>
                {Array.from({length:pages},(_,i)=>(
                  <button key={i} onClick={()=>setPage(i+1)}
                    style={{ padding:'4px 11px',border:'1px solid var(--border)',
                      background: page===i+1 ? 'var(--ink)' : 'var(--surface)',
                      color: page===i+1 ? '#fff' : 'inherit',
                      borderRadius:5,fontSize:11.5,cursor:'pointer' }}>
                    {i+1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Investment accounts shown below the securities table */}
          {sortedInvestA.length > 0 && (
            <div className="card" style={{ marginBottom:18 }}>
              <div className="card-hdr" style={{ marginBottom:8 }}>
                <div>
                  <div className="card-title">Investment Accounts (Non Cash/CD)</div>
                  <div className="card-sub">{sortedInvestA.length} accounts · {fmt.dollar(sortedInvestA.reduce((s,r)=>s+r.value,0))}</div>
                </div>
              </div>
              <div className="tbl-wrap">
                <HoldingsTable extraAccts={sortedInvestA} />
              </div>
            </div>
          )}

          {/* Cash/CD accounts shown below the securities table */}
          {sortedCashA.length > 0 && (
            <div className="card">
              <div className="card-hdr" style={{ marginBottom:8 }}>
                <div>
                  <div className="card-title">Cash & CD Accounts</div>
                  <div className="card-sub">{sortedCashA.length} accounts · {fmt.dollar(sortedCashA.reduce((s,r)=>s+r.value,0))}</div>
                </div>
              </div>
              <div className="tbl-wrap">
                <HoldingsTable extraAccts={sortedCashA} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
