import { useState } from 'react';
import { api } from '../api';
import YodleeConnector from './YodleeConnector';

export default function ImportPage({ onImport }) {
  const [msg,      setMsg]      = useState('');
  const [dragging, setDragging] = useState(false);
  const [loading,  setLoading]  = useState(false);

  async function handleFile(file) {
    if (!file) return;
    setLoading(true); setMsg('⏳ Uploading and parsing file…');
    try {
      const result = await api.importExcel(file);
      if (result.success) { setMsg(`✅ ${result.message}`); setTimeout(()=>onImport&&onImport(), 1500); }
      else setMsg('⚠️ '+(result.error||'Import failed'));
    } catch(e) { setMsg('✗ Error: '+e.message); }
    setLoading(false);
  }

  return (
    <>
      <div className="stitle">Import / Export <small>Empower · Schwab · Fidelity · Yodlee</small></div>

      <YodleeConnector onImportComplete={() => { setMsg('✅ Yodlee import completed!'); setTimeout(() => onImport && onImport(), 1500); }} />

      <div className="g2">
        <div className="card">
          <div className="card-title">Export Portfolio Data</div>
          <div style={{ padding: '20px 0' }}>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
              Download your complete portfolio data including all holdings and accounts.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="btn btn-outline"
                onClick={() => api.exportCSV()}
                style={{ flex: 1 }}
              >
                📊 Download CSV
              </button>
              <button
                className="btn btn-outline"
                onClick={() => api.exportExcel()}
                style={{ flex: 1 }}
              >
                📈 Download Excel
              </button>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
              Files include: Holdings (ticker, name, shares, price, value) and Accounts (balances, tax buckets)
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Import Portfolio from Excel</div>
          <div style={{ padding: '20px 0' }}>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
              Download your complete portfolio data including all holdings and accounts.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="btn btn-outline"
                onClick={() => api.exportCSV()}
                style={{ flex: 1 }}
              >
                📊 Download CSV
              </button>
              <button
                className="btn btn-outline"
                onClick={() => api.exportExcel()}
                style={{ flex: 1 }}
              >
                📈 Download Excel
              </button>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
              Files include: Holdings (ticker, name, shares, price, value) and Accounts (balances, tax buckets)
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Import Portfolio from Excel</div>
          <div className={`drop-zone ${dragging?'over':''}`} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0]);}} onClick={()=>document.getElementById('file-inp').click()}>
            <div style={{fontSize:34,marginBottom:10}}>📂</div>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:17,marginBottom:5}}>Drop your Empower export here</div>
            <div style={{fontSize:12.5,color:'var(--muted)'}}>or click to browse · .xlsx files only</div>
          </div>
          <input id="file-inp" type="file" accept=".xlsx" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
          {msg&&<div style={{marginTop:14,padding:'10px 14px',borderRadius:7,background:'var(--cream)',fontSize:12.5,fontFamily:"'DM Mono',monospace"}}>{msg}</div>}
        </div>
        <div className="card">
          <div className="card-title">Expected File Format</div>
          <div style={{fontSize:12.5,lineHeight:1.8,color:'var(--muted)'}}>
            <p style={{marginBottom:12}}>Your Excel file must contain these sheets:</p>
            {[{sheet:'Holdings',cols:'Ticker, Holding, Shares, Price, Change, 1 Day $, Value'},{sheet:'Top_Holdings',cols:'Rank, Ticker, Holding, Value, Portfolio Weight, 1 Day $'},{sheet:'Tax_Buckets',cols:'Institution, Account, Balance, Tax Bucket, Account Type'}].map(s=><div key={s.sheet} style={{background:'var(--cream)',borderRadius:6,padding:'8px 12px',marginBottom:8}}><div style={{fontFamily:"'DM Mono',monospace",fontWeight:600,fontSize:12,marginBottom:3}}>{s.sheet}</div><div style={{fontSize:11.5}}>{s.cols}</div></div>)}
          </div>
        </div>
      </div>
    </>
  );
}
