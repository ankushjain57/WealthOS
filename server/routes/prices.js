const express = require('express');
const router  = express.Router();
const db      = require('../db');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// GET /api/prices/quotes?tickers=AAPL,MSFT
router.get('/quotes', async (req, res) => {
  const tickers = (req.query.tickers || '')
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(Boolean);

  if (!tickers.length) return res.status(400).json({ error: 'tickers query param required' });

  try {
    const results = await Promise.allSettled(
      tickers.map(t => yahooFinance.quote(t, {}, { validateResult: false }))
    );

    const quotes = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value && r.value.regularMarketPrice != null) {
        const q = r.value;
        quotes[tickers[i]] = {
          ticker:       tickers[i],
          price:        q.regularMarketPrice,
          change_pct:   q.regularMarketChangePercent ?? 0,
          day_change:   q.regularMarketChange ?? 0,
          market_state: q.marketState ?? 'UNKNOWN',
          name:         q.shortName || q.longName || tickers[i],
        };
      } else {
        quotes[tickers[i]] = { ticker: tickers[i], error: 'Not found' };
      }
    });

    res.json(quotes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prices/refresh
// Fetches live prices from Yahoo Finance and updates all holdings in the DB.
router.post('/refresh', async (req, res) => {
  try {
    const { rows: holdings } = await db.query(
      'SELECT id, ticker, shares FROM holdings'
    );

    // Deduplicate tickers for batch fetch
    const tickers = [...new Set(holdings.map(h => h.ticker))];

    const quoteResults = await Promise.allSettled(
      tickers.map(t => yahooFinance.quote(t, {}, { validateResult: false }))
    );

    // Build ticker → quote map
    const quoteMap = {};
    tickers.forEach((t, i) => {
      const r = quoteResults[i];
      if (r.status === 'fulfilled' && r.value && r.value.regularMarketPrice != null) {
        quoteMap[t] = r.value;
      }
    });

    let updated = 0;
    const failed = new Set();

    for (const holding of holdings) {
      const q = quoteMap[holding.ticker];
      if (q) {
        const price      = q.regularMarketPrice;
        const change_pct = q.regularMarketChangePercent ?? 0;
        const day1_change = (q.regularMarketChange ?? 0) * parseFloat(holding.shares);
        const value      = price * parseFloat(holding.shares);

        await db.query(
          `UPDATE holdings SET price=$1, change_pct=$2, day1_change=$3, value=$4 WHERE id=$5`,
          [price, change_pct, day1_change, value, holding.id]
        );
        updated++;
      } else {
        failed.add(holding.ticker);
      }
    }

    // Refresh the daily snapshot so net worth reflects the updated prices
    const { rows: hRows } = await db.query('SELECT SUM(value) AS total FROM holdings');
    const { rows: aRows } = await db.query(
      `SELECT SUM(balance) AS cash FROM accounts
       WHERE tax_bucket <> 'Tax-Free / Tax-Advantaged'
         AND (
           LOWER(account_type) LIKE '%cash%'
           OR LOWER(account_type) LIKE '%cd%'
           OR LOWER(institution) LIKE '%goldman sachs%'
           OR LOWER(institution) LIKE '%marcus%'
           OR LOWER(institution) LIKE '%affinity%'
           OR LOWER(institution) LIKE '%wells fargo%'
           OR LOWER(institution) LIKE '%treasury%'
         )`
    );
    const totalInv = parseFloat(hRows[0]?.total) || 0;
    const cash = parseFloat(aRows[0]?.cash) || 0;

    await db.query(
      `INSERT INTO snapshots (snap_date, net_worth, investments, cash)
       VALUES (CURRENT_DATE, $1, $2, $3)
       ON CONFLICT (snap_date) DO UPDATE
         SET net_worth=$1, investments=$2, cash=$3`,
      [totalInv + cash, totalInv, cash]
    );

    res.json({
      updated,
      failed:       [...failed],
      total:        holdings.length,
      refreshed_at: new Date(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prices/indexes — live quotes for major market indexes
const INDEX_TICKERS = [
  { ticker: '^DJI',      label: 'DOW' },
  { ticker: '^GSPC',     label: 'S&P 500' },
  { ticker: '^NDX',      label: 'NASDAQ 100' },
  { ticker: '^RUT',      label: 'RUSSELL 2K' },
  { ticker: 'URTH',      label: 'MSCI World' },
  { ticker: '^STOXX50E', label: 'EURO STOXX 50' },
  { ticker: '^FTSE',     label: 'FTSE 100' },
  { ticker: '^N225',     label: 'NIKKEI 225' },
  { ticker: 'GC=F',      label: 'Gold' },
  { ticker: 'CL=F',      label: 'WTI Oil' },
  { ticker: 'BTC-USD',   label: 'Bitcoin' },
  { ticker: '^VIX',      label: 'VIX' },
];

// GET /api/prices/futures — E-mini & commodity futures
const FUTURES_TICKERS = [
  { ticker: 'ES=F',  label: 'S&P FUT' },
  { ticker: 'NQ=F',  label: 'NQ FUT' },
  { ticker: 'YM=F',  label: 'DOW FUT' },
  { ticker: 'RTY=F', label: 'RUSS FUT' },
  { ticker: 'NKD=F', label: 'NIK FUT' },
  { ticker: 'GC=F',  label: 'GOLD FUT' },
  { ticker: 'SI=F',  label: 'SILVER FUT' },
  { ticker: 'CL=F',  label: 'WTI FUT' },
  { ticker: 'NG=F',  label: 'NAT GAS FUT' },
  { ticker: 'ZB=F',  label: '30Y BOND FUT' },
  { ticker: 'ZN=F',  label: '10Y NOTE FUT' },
  { ticker: 'ZF=F',  label: '5Y NOTE FUT' },
  { ticker: '6E=F',  label: 'EUR/USD FUT' },
  { ticker: '6J=F',  label: 'USD/JPY FUT' },
  { ticker: 'BTC=F', label: 'BTC FUT' },
];

async function fetchQuotes(tickerDefs) {
  const results = await Promise.allSettled(
    tickerDefs.map(({ ticker }) => yahooFinance.quote(ticker, {}, { validateResult: false }))
  );
  return tickerDefs.map(({ ticker, label }, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value && r.value.regularMarketPrice != null) {
      const q = r.value;
      return { ticker, label, price: q.regularMarketPrice, change_pct: q.regularMarketChangePercent ?? 0, day_change: q.regularMarketChange ?? 0 };
    }
    return null;
  }).filter(Boolean);
}

router.get('/indexes', async (req, res) => {
  try { res.json(await fetchQuotes(INDEX_TICKERS)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/futures', async (req, res) => {
  try { res.json(await fetchQuotes(FUTURES_TICKERS)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
