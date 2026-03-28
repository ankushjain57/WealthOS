#!/bin/bash
# WealthOS 3-Tier Setup Script
# Run from ~/WealthOS: bash setup_wealthos.sh

set -e
cd ~/WealthOS

echo "📁 Creating folder structure..."
mkdir -p frontend/src/components frontend/public server/routes database

echo "📄 Moving existing files to correct locations..."
[ -f schema.sql ] && mv schema.sql database/schema.sql && echo "  ✅ schema.sql → database/"
[ -f index.js ]   && mv index.js server/index.js       && echo "  ✅ index.js → server/"
[ -f App.js ]     && mv App.js frontend/src/App.js     && echo "  ✅ App.js → frontend/src/"

# ─── ROOT package.json ────────────────────────────────────────────────────────
echo "📄 Writing root package.json..."
cat > package.json << 'EOF'
{
  "name": "wealthos",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "setup":    "cd server && npm install && cd ../frontend && npm install",
    "db:init":  "psql -U postgres -f database/schema.sql",
    "server":   "cd server && npm run dev",
    "frontend": "cd frontend && npm start",
    "test":     "node tests/test_suite.js",
    "dev":      "concurrently \"npm run server\" \"npm run frontend\""
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
EOF

# ─── SERVER package.json ──────────────────────────────────────────────────────
echo "📄 Writing server/package.json..."
cat > server/package.json << 'EOF'
{
  "name": "wealthos-server",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev":   "nodemon index.js"
  },
  "dependencies": {
    "cors":   "^2.8.5",
    "dotenv": "^16.4.5",
    "express":"^4.18.3",
    "multer": "^1.4.5-lts.1",
    "pg":     "^8.11.3",
    "xlsx":   "^0.18.5"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
EOF

# ─── SERVER .env ──────────────────────────────────────────────────────────────
echo "📄 Writing server/.env..."
cat > server/.env << 'EOF'
PORT=3001
DATABASE_URL=postgresql://localhost:5432/wealthos
EOF

# ─── SERVER index.js ─────────────────────────────────────────────────────────
echo "📄 Writing server/index.js..."
cat > server/index.js << 'EOF'
require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const portfolioRoutes = require('./routes/portfolio');
const analyticsRoutes = require('./routes/analytics');
const stressRoutes    = require('./routes/stress');
const importRoutes    = require('./routes/import');
const accountsRoutes  = require('./routes/accounts');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

app.use('/api/portfolio', portfolioRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/stress',    stressRoutes);
app.use('/api/import',    importRoutes);
app.use('/api/accounts',  accountsRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

app.listen(PORT, () => console.log(`WealthOS API → http://localhost:${PORT}`));
EOF

# ─── SERVER db.js ─────────────────────────────────────────────────────────────
echo "📄 Writing server/db.js..."
cat > server/db.js << 'EOF'
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (err) => console.error('DB error', err));
module.exports = pool;
EOF

# ─── ROUTE: portfolio ─────────────────────────────────────────────────────────
echo "📄 Writing server/routes/portfolio.js..."
cat > server/routes/portfolio.js << 'EOF'
const express = require('express');
const router  = express.Router();
const db      = require('../db');

router.get('/holdings', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM holdings ORDER BY value DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/summary', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT SUM(value) AS total_value, SUM(day1_change) AS total_day1,
             COUNT(*) AS position_count, MAX(imported_at) AS last_import
      FROM holdings`);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/holdings', async (req, res) => {
  const { ticker, name, shares, price } = req.body;
  if (!ticker || !shares || !price)
    return res.status(400).json({ error: 'ticker, shares, price required' });
  const value = parseFloat(shares) * parseFloat(price);
  try {
    const { rows } = await db.query(
      `INSERT INTO holdings (ticker, name, shares, price, change_pct, day1_change, value)
       VALUES ($1,$2,$3,$4,0,0,$5) RETURNING *`,
      [ticker.toUpperCase(), name || ticker, shares, price, value]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/holdings/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM holdings WHERE id=$1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
EOF

# ─── ROUTE: analytics ────────────────────────────────────────────────────────
echo "📄 Writing server/routes/analytics.js..."
cat > server/routes/analytics.js << 'EOF'
const express = require('express');
const router  = express.Router();
const db      = require('../db');

const BETA = {
  NVDA:1.9,META:1.6,AMZN:1.4,GOOG:1.2,MSFT:1.15,AAPL:1.1,
  STT:1.3,GS:1.4,JPM:1.1,JEPQ:0.7,JEPI:0.55,
  GLD:-0.05,GLDM:-0.05,SLV:0.05,PFTPX:0.15,GILHX:0.12,
  BND:-0.2,TLT:-0.25,IXC:1.1,XOM:0.9,VOO:1.0,SPY:1.0,QQQ:1.05,CASH:0
};
const SECTOR = {
  JEPQ:'Covered-Call ETF',JEPI:'Covered-Call ETF',
  NVDA:'Technology',META:'Technology',MSFT:'Technology',GOOG:'Technology',
  AAPL:'Technology',AMZN:'Technology',
  STT:'Financials',GS:'Financials',JPM:'Financials',
  PFTPX:'Fixed Income',GILHX:'Fixed Income',BND:'Fixed Income',TLT:'Fixed Income',
  GLD:'Commodities',GLDM:'Commodities',SLV:'Commodities',IAU:'Commodities',
  IXC:'Energy',XOM:'Energy',CVX:'Energy',
  VOO:'Broad Index',SPY:'Broad Index',QQQ:'Broad Index',CASH:'Cash'
};

router.get('/metrics', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT ticker, value FROM holdings');
    const total = rows.reduce((s, h) => s + parseFloat(h.value), 0);
    if (!total) return res.json({ beta:1, hhi:0, volatility:16, sharpe:0.25, total:0 });
    const b = rows.reduce((s,h) => s + (parseFloat(h.value)/total)*(BETA[h.ticker]??0.85), 0);
    const hhi = rows.reduce((s,h) => { const w=(parseFloat(h.value)/total)*100; return s+w*w; }, 0);
    const vol = b * 16;
    const ret = Math.max(0.06, 0.09-(b-1)*0.02);
    res.json({ beta:+b.toFixed(3), hhi:+hhi.toFixed(1), volatility:+vol.toFixed(1), sharpe:+((ret-0.045)/(vol/100)).toFixed(3), total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/sectors', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT ticker, value FROM holdings');
    const total = rows.reduce((s,h) => s+parseFloat(h.value), 0);
    const map = {};
    for (const h of rows) { const sec=SECTOR[h.ticker]||'Other'; map[sec]=(map[sec]||0)+parseFloat(h.value); }
    res.json(Object.entries(map).map(([sector,value]) => ({ sector, value:+value.toFixed(2), pct:+((value/total)*100).toFixed(2) })).sort((a,b)=>b.value-a.value));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/concentration', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT ticker, name, value FROM holdings ORDER BY value DESC LIMIT 20');
    const total = rows.reduce((s,h) => s+parseFloat(h.value), 0);
    res.json(rows.map(h => ({ ticker:h.ticker, name:h.name, value:parseFloat(h.value), pct:+((parseFloat(h.value)/total)*100).toFixed(2) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
EOF

# ─── ROUTE: stress ───────────────────────────────────────────────────────────
echo "📄 Writing server/routes/stress.js..."
cat > server/routes/stress.js << 'EOF'
const express = require('express');
const router  = express.Router();
const db      = require('../db');

const SCENARIOS = {
  mild:    { label:'Mild Correction',   icon:'📉', eq:-.10, bd:.02,  gd:.03,  en:-.05, cash:0 },
  bear:    { label:'Bear Market',       icon:'🐻', eq:-.25, bd:.05,  gd:.08,  en:-.15, cash:0 },
  crash:   { label:'Market Crash',      icon:'💥', eq:-.40, bd:.10,  gd:.15,  en:-.25, cash:0 },
  rate:    { label:'Rate Spike +200bp', icon:'📈', eq:-.15, bd:-.08, gd:-.05, en:.05,  cash:.02 },
  inflate: { label:'Inflation Surge',   icon:'🔥', eq:-.08, bd:-.12, gd:.20,  en:.15,  cash:-.03 }
};
const BOND   = new Set(['PFTPX','GILHX','BND','AGG','TLT','IEF']);
const GOLD   = new Set(['GLD','GLDM','SLV','IAU','FNV']);
const ENERGY = new Set(['XOM','CVX','IXC','ENB','LNG','TTE']);
const CASH   = new Set(['CASH','VMFXX','SPAXX']);

function shock(ticker, d) {
  if (BOND.has(ticker))   return d.bd;
  if (GOLD.has(ticker))   return d.gd;
  if (ENERGY.has(ticker)) return d.en;
  if (CASH.has(ticker))   return d.cash;
  return d.eq;
}

router.get('/all', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT ticker, value FROM holdings');
    const total = rows.reduce((s,h) => s+parseFloat(h.value), 0);
    const results = Object.entries(SCENARIOS).map(([key,def]) => {
      const impact = rows.reduce((s,h) => s+parseFloat(h.value)*shock(h.ticker,def), 0);
      return { key, label:def.label, icon:def.icon, impact:+impact.toFixed(2), pct:+((impact/total)*100).toFixed(2) };
    });
    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:scenario', async (req, res) => {
  const def = SCENARIOS[req.params.scenario];
  if (!def) return res.status(400).json({ error: 'Unknown scenario' });
  try {
    const { rows } = await db.query('SELECT ticker, name, value FROM holdings');
    const total = rows.reduce((s,h) => s+parseFloat(h.value), 0);
    const items = rows.map(h => {
      const s = shock(h.ticker, def);
      const impact = parseFloat(h.value)*s;
      return { ticker:h.ticker, name:h.name, value:parseFloat(h.value), shock:s, impact:+impact.toFixed(2) };
    }).sort((a,b) => a.impact-b.impact);
    const totalImpact = items.reduce((s,i) => s+i.impact, 0);
    res.json({ scenario:req.params.scenario, label:def.label, totalImpact:+totalImpact.toFixed(2), pct:+((totalImpact/total)*100).toFixed(2), items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
EOF

# ─── ROUTE: accounts ─────────────────────────────────────────────────────────
echo "📄 Writing server/routes/accounts.js..."
cat > server/routes/accounts.js << 'EOF'
const express = require('express');
const router  = express.Router();
const db      = require('../db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM accounts ORDER BY balance DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/buckets', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT tax_bucket, SUM(balance) AS total FROM accounts GROUP BY tax_bucket ORDER BY total DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const { institution, account_name, balance, tax_bucket, account_type } = req.body;
  if (!institution || !balance) return res.status(400).json({ error: 'institution and balance required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO accounts (institution, account_name, balance, tax_bucket, account_type)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [institution, account_name||'', parseFloat(balance), tax_bucket||'Taxable', account_type||'']);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM accounts WHERE id=$1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
EOF

# ─── ROUTE: import ───────────────────────────────────────────────────────────
echo "📄 Writing server/routes/import.js..."
cat > server/routes/import.js << 'EOF'
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const db      = require('../db');
const upload  = multer({ storage: multer.memoryStorage() });

router.post('/excel', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    let holdingsLoaded = 0, accountsLoaded = 0;

    if (wb.SheetNames.includes('Holdings')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Holdings']);
      const h = raw.filter(r=>(r.Value||0)>0).map(r=>[
        String(r.Ticker||'').substring(0,10), String(r.Holding||'').substring(0,60),
        parseFloat(r.Shares||0), parseFloat(r.Price||0),
        parseFloat(r.Change||0), parseFloat(r['1 Day $']||0), parseFloat(r.Value||0)
      ]);
      await db.query('TRUNCATE holdings RESTART IDENTITY');
      for (const row of h) {
        await db.query(
          `INSERT INTO holdings (ticker,name,shares,price,change_pct,day1_change,value) VALUES ($1,$2,$3,$4,$5,$6,$7)`, row);
      }
      holdingsLoaded = h.length;
    }

    if (wb.SheetNames.includes('Tax_Buckets')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Tax_Buckets'], { header:1 });
      const a = raw.slice(3).map(r=>([
        String(r[0]||'').substring(0,40), String(r[1]||'').substring(0,60),
        parseFloat(r[2]||0), String(r[3]||'Taxable'), String(r[4]||'')
      ])).filter(r=>r[2]>0);
      await db.query('TRUNCATE accounts RESTART IDENTITY');
      for (const row of a) {
        await db.query(
          `INSERT INTO accounts (institution,account_name,balance,tax_bucket,account_type) VALUES ($1,$2,$3,$4,$5)`, row);
      }
      accountsLoaded = a.length;
    }

    res.json({ success:true, holdingsLoaded, accountsLoaded, message:`Loaded ${holdingsLoaded} holdings and ${accountsLoaded} accounts` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
EOF

# ─── FRONTEND public/index.html ───────────────────────────────────────────────
echo "📄 Writing frontend/public/index.html..."
cat > frontend/public/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WealthOS</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,600&display=swap" rel="stylesheet">
</head>
<body><div id="root"></div></body>
</html>
EOF

# ─── FRONTEND package.json ────────────────────────────────────────────────────
echo "📄 Writing frontend/package.json..."
cat > frontend/package.json << 'EOF'
{
  "name": "wealthos-frontend",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "chart.js": "^4.4.1",
    "react": "^18.2.0",
    "react-chartjs-2": "^5.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build"
  },
  "proxy": "http://localhost:3001",
  "browserslist": {
    "production": [">0.2%","not dead"],
    "development": ["last 1 chrome version"]
  }
}
EOF

# ─── FRONTEND src/index.js ────────────────────────────────────────────────────
echo "📄 Writing frontend/src/index.js..."
cat > frontend/src/index.js << 'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
EOF

# ─── FRONTEND src/App.js ─────────────────────────────────────────────────────
echo "📄 Writing frontend/src/App.js..."
cat > frontend/src/App.js << 'EOF'
import { useState } from 'react';
import './index.css';
import Dashboard  from './components/Dashboard';
import Portfolio  from './components/Portfolio';
import Risk       from './components/Risk';
import Stress     from './components/Stress';
import Accounts   from './components/Accounts';
import TaxBuckets from './components/TaxBuckets';
import ImportPage from './components/ImportPage';

const TABS = [
  { id:'dashboard', label:'Dashboard' },
  { id:'portfolio', label:'Portfolio' },
  { id:'risk',      label:'Risk & Volatility' },
  { id:'stress',    label:'Stress Testing' },
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
EOF

# ─── FRONTEND src/api.js ─────────────────────────────────────────────────────
echo "📄 Writing frontend/src/api.js..."
cat > frontend/src/api.js << 'EOF'
const BASE = '/api';
async function get(path) { const r = await fetch(BASE+path); if (!r.ok) throw new Error(await r.text()); return r.json(); }
async function post(path, body) { const r = await fetch(BASE+path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }); if (!r.ok) throw new Error(await r.text()); return r.json(); }
async function del(path) { const r = await fetch(BASE+path, { method:'DELETE' }); if (!r.ok) throw new Error(await r.text()); return r.json(); }

export const api = {
  getHoldings:      () => get('/portfolio/holdings'),
  getSummary:       () => get('/portfolio/summary'),
  addHolding:       (h) => post('/portfolio/holdings', h),
  deleteHolding:    (id) => del(`/portfolio/holdings/${id}`),
  getMetrics:       () => get('/analytics/metrics'),
  getSectors:       () => get('/analytics/sectors'),
  getConcentration: () => get('/analytics/concentration'),
  getAllStress:      () => get('/stress/all'),
  getStressDetail:  (s) => get(`/stress/${s}`),
  getAccounts:      () => get('/accounts'),
  getBuckets:       () => get('/accounts/buckets'),
  addAccount:       (a) => post('/accounts', a),
  deleteAccount:    (id) => del(`/accounts/${id}`),
  importExcel: (file) => {
    const fd = new FormData(); fd.append('file', file);
    return fetch(BASE+'/import/excel', { method:'POST', body:fd }).then(r=>r.json());
  }
};

export const fmt = {
  dollar: (n) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n),
  pct:    (n) => (+n).toFixed(1)+'%',
  sign:   (n) => (n>=0?'+':'')+fmt.dollar(n),
};
EOF

# ─── FRONTEND src/index.css ──────────────────────────────────────────────────
echo "📄 Writing frontend/src/index.css..."
cat > frontend/src/index.css << 'EOF'
:root {
  --ink:#0d0d12;--paper:#f4f2ed;--cream:#eae6dc;--gold:#c8a84b;--gold-lt:#ecdfa0;
  --gold-dk:#7a6128;--sage:#3d6b35;--sage-lt:#e8f2e7;--red:#b52d2d;--red-lt:#fdf1f1;
  --amber:#c47a0a;--amber-lt:#fef7e6;--blue:#1e56a0;--blue-lt:#e8f0fa;
  --border:#d8d3c8;--muted:#7c7668;--surface:#fff;
  --sh:0 1px 3px rgba(0,0,0,.07),0 4px 12px rgba(0,0,0,.05);
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:var(--paper);color:var(--ink);min-height:100vh;font-size:14px;line-height:1.5}
button{font-family:inherit;cursor:pointer}
.hdr{background:var(--ink);color:#fff;height:54px;padding:0 28px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:200}
.hdr-logo{font-family:'DM Serif Display',serif;font-size:21px}
.hdr-logo span{color:var(--gold)}
.hdr-nw{font-family:'DM Serif Display',serif;font-size:19px;color:var(--gold-lt);text-align:right}
.hdr-sub{font-size:10px;color:rgba(255,255,255,.45);font-family:'DM Mono',monospace;letter-spacing:.04em}
.sitenav{background:var(--cream);border-bottom:1px solid var(--border);padding:0 28px;display:flex;overflow-x:auto;position:sticky;top:54px;z-index:190}
.sitenav button{background:none;border:none;border-bottom:2px solid transparent;padding:13px 18px;font-size:12.5px;color:var(--muted);white-space:nowrap;transition:all .15s}
.sitenav button:hover{color:var(--ink)}
.sitenav button.active{color:var(--ink);font-weight:600;border-bottom-color:var(--gold)}
main{max-width:1380px;margin:0 auto;padding:26px 28px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.g5{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.mb18{margin-bottom:18px}.mb24{margin-bottom:24px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px 22px;box-shadow:var(--sh)}
.card-title{font-family:'DM Serif Display',serif;font-size:15px;margin-bottom:14px}
.card-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
.card-sub{font-size:11px;color:var(--muted);font-family:'DM Mono',monospace;margin-top:2px}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:18px 20px;box-shadow:var(--sh)}
.kpi-lbl{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:7px}
.kpi-val{font-family:'DM Serif Display',serif;font-size:27px;line-height:1}
.kpi-sub{font-size:11px;font-family:'DM Mono',monospace;margin-top:5px;color:var(--muted)}
.pos{color:var(--sage)}.neg{color:var(--red)}
.bdg{display:inline-flex;align-items:center;padding:3px 9px;border-radius:100px;font-size:10.5px;font-weight:600}
.bdg-red{background:var(--red-lt);color:var(--red)}.bdg-amber{background:var(--amber-lt);color:var(--amber)}
.bdg-sage{background:var(--sage-lt);color:var(--sage)}.bdg-blue{background:var(--blue-lt);color:var(--blue)}
.bdg-gold{background:#fdf8ed;color:var(--gold-dk)}
.alert{border-radius:8px;padding:11px 15px;margin-bottom:11px;font-size:12.5px;display:flex;gap:9px;align-items:flex-start;line-height:1.55}
.a-red{background:var(--red-lt);border:1px solid #f0c8c8;color:#7a1a1a}
.a-amber{background:var(--amber-lt);border:1px solid #fad99a;color:#7a4a00}
.a-blue{background:var(--blue-lt);border:1px solid #b8d0f0;color:#183d78}
.a-sage{background:var(--sage-lt);border:1px solid #b8d8b4;color:#2a4a26}
.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{padding:9px 11px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);border-bottom:1px solid var(--border);background:var(--cream);white-space:nowrap}
td{padding:9px 11px;border-bottom:1px solid #f0ece3;font-family:'DM Mono',monospace;font-size:12px}
td.txt{font-family:'DM Sans',sans-serif;font-size:12.5px}
th.r,td.r{text-align:right}
tr:last-child td{border-bottom:none}
tr:hover td{background:var(--paper)}
.tkr{display:inline-block;background:var(--cream);border:1px solid var(--border);border-radius:4px;padding:2px 6px;font-family:'DM Mono',monospace;font-size:10.5px;font-weight:600}
.ch-wrap{position:relative}.ch-sm{height:200px}.ch-md{height:270px}.ch-lg{height:340px}
.pb{height:8px;border-radius:4px;background:var(--cream);overflow:hidden;flex:1}
.pb-fill{height:100%;border-radius:4px;transition:width .4s}
.row-m{display:flex;align-items:center;gap:10px;padding:5px 0}
.row-m .lbl{width:110px;font-size:11.5px;color:var(--muted)}
.row-m .val{width:70px;text-align:right;font-family:'DM Mono',monospace;font-size:11.5px;font-weight:600}
.scn{border:1.5px solid var(--border);border-radius:9px;padding:15px;cursor:pointer;transition:all .15s;background:var(--surface);text-align:center}
.scn:hover,.scn.sel{border-color:var(--gold);box-shadow:0 0 0 3px var(--gold-lt)}
.scn-icon{font-size:24px;margin-bottom:6px}.scn-name{font-size:12px;font-weight:700;margin-bottom:4px}
.scn-val{font-family:'DM Serif Display',serif;font-size:21px}
.scn-sub{font-size:10.5px;color:var(--muted);font-family:'DM Mono',monospace}
.scn-loss{color:var(--red)}.scn-gain{color:var(--sage)}
.btn{padding:9px 20px;border-radius:7px;font-size:13px;font-weight:600;border:none;transition:all .15s}
.btn-ink{background:var(--ink);color:#fff}.btn-ink:hover{background:#1a1a2e}
.btn-outline{background:var(--cream);color:var(--ink);border:1px solid var(--border)}
.btn-outline:hover{background:var(--gold-lt);border-color:var(--gold)}
.btn-sm{padding:5px 12px;font-size:11.5px;border-radius:5px}
.stitle{font-family:'DM Serif Display',serif;font-size:21px;display:flex;align-items:baseline;gap:9px;margin-bottom:20px}
.stitle small{font-family:'DM Sans',sans-serif;font-size:12.5px;color:var(--muted);font-weight:400}
.drop-zone{border:2px dashed var(--border);border-radius:10px;padding:36px;text-align:center;cursor:pointer;transition:all .2s;background:var(--cream)}
.drop-zone:hover,.drop-zone.over{border-color:var(--gold);background:var(--gold-lt)}
.fg{display:flex;flex-direction:column;gap:5px}
.fg label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.fg input,.fg select{padding:9px 13px;border:1px solid var(--border);border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;background:var(--surface);color:var(--ink);outline:none}
.fg input:focus,.fg select:focus{border-color:var(--gold)}
.loading{display:flex;align-items:center;justify-content:center;padding:60px;color:var(--muted);font-family:'DM Mono',monospace;font-size:13px}
@media(max-width:1100px){.g4{grid-template-columns:1fr 1fr}.g5{grid-template-columns:1fr 1fr}}
@media(max-width:768px){main{padding:14px}.g2,.g3,.g4,.g5{grid-template-columns:1fr}.sitenav,.hdr{padding:0 14px}}
EOF

# ─── COMPONENTS ───────────────────────────────────────────────────────────────
echo "📄 Writing React components..."

cat > frontend/src/components/Dashboard.js << 'EOF'
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
EOF

cat > frontend/src/components/Portfolio.js << 'EOF'
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
EOF

cat > frontend/src/components/Risk.js << 'EOF'
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
EOF

cat > frontend/src/components/Stress.js << 'EOF'
import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { api, fmt } from '../api';

export default function Stress() {
  const [scenarios, setScenarios] = useState([]);
  const [detail,    setDetail]    = useState(null);
  const [active,    setActive]    = useState(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => { api.getAllStress().then(s=>{setScenarios(s);setLoading(false);}).catch(()=>setLoading(false)); }, []);

  function selectScn(key) { setActive(key); api.getStressDetail(key).then(setDetail); }

  if (loading) return <div className="loading">Running stress scenarios…</div>;
  const chartData = { labels:scenarios.map(s=>s.label), datasets:[{data:scenarios.map(s=>s.impact),backgroundColor:scenarios.map(s=>s.impact<0?'rgba(181,45,45,.7)':'rgba(61,107,53,.7)'),borderColor:scenarios.map(s=>s.impact<0?'#b52d2d':'#3d6b35'),borderWidth:1}] };

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
          {detail&&<><div style={{marginBottom:16}}><div className="kpi"><div className="kpi-lbl">Total Impact</div><div className={`kpi-val ${detail.totalImpact<0?'neg':'pos'}`}>{fmt.dollar(detail.totalImpact)}</div><div className="kpi-sub">{fmt.pct(detail.pct)} of portfolio</div></div></div><div className="tbl-wrap" style={{maxHeight:240,overflowY:'auto'}}><table><thead><tr><th>Ticker</th><th className="r">Value</th><th className="r">Shock</th><th className="r">Impact</th></tr></thead><tbody>{detail.items.slice(0,15).map((item,i)=><tr key={i}><td><span className="tkr">{item.ticker}</span></td><td className="r">{fmt.dollar(item.value)}</td><td className={`r ${item.shock<0?'neg':'pos'}`}>{fmt.pct(item.shock*100)}</td><td className={`r ${item.impact<0?'neg':'pos'}`}>{fmt.dollar(item.impact)}</td></tr>)}</tbody></table></div></>}
        </div>
      </div>
    </div>
  );
}
EOF

cat > frontend/src/components/Accounts.js << 'EOF'
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
EOF

cat > frontend/src/components/TaxBuckets.js << 'EOF'
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
EOF

cat > frontend/src/components/ImportPage.js << 'EOF'
import { useState } from 'react';
import { api } from '../api';

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
    <div>
      <div className="stitle">Import / Export <small>Empower · Schwab · Fidelity</small></div>
      <div className="g2">
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
    </div>
  );
}
EOF

echo ""
echo "✅ All files created successfully!"
echo ""
echo "Next steps:"
echo "  1. npm install          (install concurrently)"
echo "  2. npm run setup        (install server + frontend deps)"
echo "  3. npm run db:init      (create PostgreSQL database)"
echo "  4. npm run dev          (start both servers)"
echo ""
echo "Then open http://localhost:3000"
