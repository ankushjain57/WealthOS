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
