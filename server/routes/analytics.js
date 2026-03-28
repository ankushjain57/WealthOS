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
