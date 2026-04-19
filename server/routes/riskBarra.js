/**
 * Barra-style multi-factor risk model
 *
 * 8-factor model (inspired by Barra USE4):
 *   Market      = SPY daily return
 *   Value       = IVE − IVW  (value minus growth, like HML)
 *   Momentum    = MTUM − SPY (excess momentum return, like UMD)
 *   Size        = IWM  − SPY (small minus big, like SMB)
 *   Quality     = QUAL − SPY (quality premium)
 *   FixedIncome = AGG         (bond/duration factor)
 *   RealEstate  = VNQ  − SPY (real estate excess return)
 *   Crypto      = BTC-USD     (digital assets factor)
 *
 * For each security with ≥60 common trading dates we run OLS:
 *   R_i = α + Σ β_k F_k + ε_i
 * Securities without Yahoo Finance history use heuristic loadings.
 *
 * Portfolio analytics:
 *   β_p       = Σ w_i β_i                   (weighted factor exposures)
 *   σ²_sys    = β_p' Σ_F β_p                (systematic/factor variance)
 *   σ²_spec   = Σ w_i² σ²_ε,i              (idiosyncratic variance)
 *   σ²_total  = σ²_sys + σ²_spec
 *   E[R_p]    = Σ β_pk × premium_k          (expected annual return)
 *   Sharpe    = (E[R_p] − Rf) / σ_total
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// ─── Factor metadata ──────────────────────────────────────────────────────────
const FACTOR_NAMES = ['Market', 'Value', 'Momentum', 'Size', 'Quality', 'FixedIncome', 'RealEstate', 'Crypto'];
const N_FACTORS = FACTOR_NAMES.length;

// Factor ETFs used to construct factor return time-series
const FACTOR_ETFS = ['SPY', 'MTUM', 'QUAL', 'IWM', 'IVE', 'IVW', 'AGG', 'VNQ', 'BTC-USD'];

// Expected annual returns per factor (total return for Market/FixedIncome; premium for others)
const FACTOR_PREMIUM = { Market: 0.10, Value: 0.025, Momentum: 0.045, Size: 0.020, Quality: 0.030, FixedIncome: 0.045, RealEstate: 0.015, Crypto: 0.0 };

const RF = 0.045; // risk-free rate (4.5% T-bill)

// ─── Heuristic loadings for tickers that aren't on Yahoo Finance ─────────────
// Order: [Market, Value, Momentum, Size, Quality, FixedIncome, RealEstate, Crypto]
const HEURISTIC_LOADINGS = {
  RE1: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1.20, 0.00],
  RE2: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1.20, 0.00],
  RE3: [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1.20, 0.00],
  NON40OXK6: [0.55, 0.05, 0.00, -0.10, 0.10, 0.45, 0.00, 0.00], // SS Target 2030
  NON40OXL6: [1.00, 0.00, 0.00, -0.05, 0.05, 0.00, 0.00, 0.00], // SS S&P 500 Index
  FDRXX:     [0.00, 0.00, 0.00,  0.00, 0.00, 0.05, 0.00, 0.00], // Fidelity MM
  // Equity-Indexed Annuities: S&P-linked upside (capped ~10%) + 0% principal floor
  // Bond backing (~70%) funds the floor; effective mkt beta ~0.40 (option-delta weighted)
  EIA_AXA:   [0.40, 0.05, 0.00,  0.00, 0.05, 0.25, 0.00, 0.00], // AXA — 100% equity index
  EIA_PWR:   [0.35, 0.05, 0.00,  0.00, 0.05, 0.30, 0.00, 0.00], // Power Financial — 10% cap
};
// Annualized specific vol (%) for heuristic tickers
const HEURISTIC_SPEC_VOL = { RE1: 0.12, RE2: 0.15, RE3: 0.15, NON40OXK6: 0.08, NON40OXL6: 0.02, FDRXX: 0.001, EIA_AXA: 0.09, EIA_PWR: 0.08 };

// Default for equity tickers where regression fails
const DEFAULT_EQUITY_LOADINGS = [0.90, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
const DEFAULT_EQUITY_SPEC_VOL = 0.20;

// ─── Linear algebra (small dense matrices, 8–9×8–9) ─────────────────────────
function transpose(M) { return M[0].map((_, j) => M.map(r => r[j])); }

function matVec(A, v) { return A.map(row => row.reduce((s, a, j) => s + a * v[j], 0)); }

function dot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }

function matMul(A, B) {
  const m = A.length, n = B[0].length, p = B.length;
  return Array.from({ length: m }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      A[i].reduce((s, v, k) => s + v * B[k][j], 0)));
}

function inverse(M) {
  const n = M.length;
  const aug = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => +(i === j))]);
  for (let col = 0; col < n; col++) {
    let best = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(aug[r][col]) > Math.abs(aug[best][col])) best = r;
    [aug[col], aug[best]] = [aug[best], aug[col]];
    const s = aug[col][col];
    if (Math.abs(s) < 1e-14) throw new Error('Singular matrix');
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= s;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      for (let j = 0; j < 2 * n; j++) aug[r][j] -= f * aug[col][j];
    }
  }
  return aug.map(r => r.slice(n));
}

function ols(Y, X) {
  // Y: number[n], X: number[n][k]  → { betas[k], residuals[n], specificVar (daily) }
  const Xt = transpose(X);
  let XtXinv;
  try { XtXinv = inverse(matMul(Xt, X)); } catch { return null; }
  const betas = matVec(XtXinv, matVec(Xt, Y));
  const residuals = Y.map((y, i) => y - dot(betas, X[i]));
  const specificVar = residuals.reduce((s, e) => s + e * e, 0) / Math.max(Y.length - X[0].length, 1);
  return { betas, residuals, specificVar };
}

function covMatrix(matrix) {
  // matrix: n×k → k×k sample covariance
  const n = matrix.length, k = matrix[0].length;
  const means = Array(k).fill(0);
  for (let t = 0; t < n; t++) for (let j = 0; j < k; j++) means[j] += matrix[t][j];
  for (let j = 0; j < k; j++) means[j] /= n;
  const C = Array.from({ length: k }, () => Array(k).fill(0));
  for (let t = 0; t < n; t++)
    for (let j = 0; j < k; j++)
      for (let l = 0; l < k; l++)
        C[j][l] += (matrix[t][j] - means[j]) * (matrix[t][l] - means[l]);
  for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) C[j][l] /= (n - 1);
  return C;
}

// ─── Price / return fetching ──────────────────────────────────────────────────
async function fetchReturns(ticker, period1, period2) {
  try {
    const hist = await yf.historical(ticker, { period1, period2, interval: '1d' }, { validateResult: false });
    if (!hist || hist.length < 10) return null;
    hist.sort((a, b) => new Date(a.date) - new Date(b.date));
    const returns = {};
    for (let i = 1; i < hist.length; i++) {
      const p0 = hist[i - 1].adjClose ?? hist[i - 1].close;
      const p1 = hist[i].adjClose ?? hist[i].close;
      if (p0 > 0 && p1 > 0) {
        returns[hist[i].date.toISOString().slice(0, 10)] = Math.log(p1 / p0);
      }
    }
    return returns;
  } catch { return null; }
}

// ─── Cache ───────────────────────────────────────────────────────────────────
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 4 * 60 * 60 * 1000;

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /api/risk/barra/refresh  — clears cache
router.post('/barra/refresh', (req, res) => {
  _cache = null; _cacheAt = 0;
  res.json({ cleared: true });
});

// GET /api/risk/barra
router.get('/barra', async (req, res) => {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) return res.json(_cache);

  try {
    // ── 1. Holdings ──────────────────────────────────────────────────────────
    const { rows: holdings } = await db.query(
      'SELECT ticker, name, account_name, product_type, shares, price, value FROM holdings ORDER BY value DESC'
    );
    const totalValue = holdings.reduce((s, h) => s + parseFloat(h.value), 0);
    if (totalValue === 0) return res.status(400).json({ error: 'No holdings' });

    // ── 2. Date range: ~270 calendar days → ~180 trading days ────────────────
    const period2 = new Date();
    const period1 = new Date(period2.getTime() - 270 * 24 * 60 * 60 * 1000);
    const [p1, p2] = [period1.toISOString().slice(0, 10), period2.toISOString().slice(0, 10)];

    // ── 3. Fetch factor ETF returns ───────────────────────────────────────────
    const etfReturnResults = await Promise.allSettled(FACTOR_ETFS.map(t => fetchReturns(t, p1, p2)));
    const etfReturns = {};
    FACTOR_ETFS.forEach((t, i) => {
      etfReturns[t] = etfReturnResults[i].status === 'fulfilled' ? etfReturnResults[i].value : null;
    });

    // ── 4. Common trading dates (inner join across all 8 equity factor ETFs) ──
    const CORE = ['SPY', 'MTUM', 'QUAL', 'IWM', 'IVE', 'IVW', 'AGG', 'VNQ'];
    const dateSets = CORE.map(t => new Set(etfReturns[t] ? Object.keys(etfReturns[t]) : []));
    const commonDates = [...dateSets[0]].filter(d => dateSets.every(s => s.has(d))).sort();
    if (commonDates.length < 30) return res.status(500).json({ error: 'Insufficient market data', dates: commonDates.length });

    // Date → row-index for O(1) lookup
    const dateIdx = {};
    commonDates.forEach((d, i) => { dateIdx[d] = i; });

    // ── 5. Build factor return matrix (n × 8) + intercept (n × 9) ────────────
    const F = commonDates.map(d => {
      const r = t => etfReturns[t]?.[d] ?? 0;
      return [
        r('SPY'),               // Market
        r('IVE') - r('IVW'),    // Value (HML proxy)
        r('MTUM') - r('SPY'),   // Momentum (UMD proxy)
        r('IWM')  - r('SPY'),   // Size (SMB proxy)
        r('QUAL') - r('SPY'),   // Quality
        r('AGG'),               // Fixed Income
        r('VNQ')  - r('SPY'),   // Real Estate
        etfReturns['BTC-USD']?.[d] ?? 0, // Crypto
      ];
    });
    const F_with_ones = F.map(row => [...row, 1]); // add intercept column

    // ── 6. Factor covariance matrix Σ_F (annualized 8×8) ────────────────────
    const Sigma_F = covMatrix(F).map(row => row.map(v => v * 252));

    // ── 7. Fetch security returns for equities (skip heuristic tickers) ───────
    const heuristicSet = new Set(Object.keys(HEURISTIC_LOADINGS));
    const allTickers = [...new Set(holdings.map(h => h.ticker))].filter(t => !heuristicSet.has(t));
    // Limit to top 55 by portfolio position (already sorted by value)
    const fetchTickers = allTickers.slice(0, 55);

    const secRetResults = await Promise.allSettled(fetchTickers.map(t => fetchReturns(t, p1, p2)));
    const secReturns = {};
    fetchTickers.forEach((t, i) => {
      if (secRetResults[i].status === 'fulfilled') secReturns[t] = secRetResults[i].value;
    });

    // ── 8. OLS regression per security ───────────────────────────────────────
    const secData = {}; // ticker → { loadings[8], specificVar (daily), r2, method }

    for (const ticker of allTickers) {
      const ret = secReturns[ticker];
      if (!ret) {
        secData[ticker] = { loadings: DEFAULT_EQUITY_LOADINGS, specificVar: dailyVar(DEFAULT_EQUITY_SPEC_VOL), r2: 0, method: 'default' };
        continue;
      }
      const alignedDates = commonDates.filter(d => ret[d] !== undefined);
      if (alignedDates.length < 60) {
        secData[ticker] = { loadings: DEFAULT_EQUITY_LOADINGS, specificVar: dailyVar(DEFAULT_EQUITY_SPEC_VOL), r2: 0, method: 'default' };
        continue;
      }
      const Y = alignedDates.map(d => ret[d]);
      const X = alignedDates.map(d => F_with_ones[dateIdx[d]]);
      const fit = ols(Y, X);
      if (!fit) {
        secData[ticker] = { loadings: DEFAULT_EQUITY_LOADINGS, specificVar: dailyVar(DEFAULT_EQUITY_SPEC_VOL), r2: 0, method: 'default' };
        continue;
      }
      const meanY = Y.reduce((s, y) => s + y, 0) / Y.length;
      const ssTot = Y.reduce((s, y) => s + (y - meanY) ** 2, 0);
      const ssRes = fit.residuals.reduce((s, e) => s + e * e, 0);
      secData[ticker] = {
        loadings: fit.betas.slice(0, N_FACTORS), // first 8 are factor loadings; last is alpha
        specificVar: fit.specificVar,
        r2: Math.max(0, 1 - ssRes / Math.max(ssTot, 1e-12)),
        method: 'regression',
      };
    }

    // Apply heuristics
    for (const [ticker, loadings] of Object.entries(HEURISTIC_LOADINGS)) {
      const specVol = HEURISTIC_SPEC_VOL[ticker] ?? DEFAULT_EQUITY_SPEC_VOL;
      secData[ticker] = { loadings, specificVar: dailyVar(specVol), r2: null, method: 'heuristic' };
    }

    // ── 9. Compute portfolio-level factor loadings (weighted) ─────────────────
    const beta_p = Array(N_FACTORS).fill(0);
    let specVarPortfolio = 0; // annualized specific variance
    let regressionValue = 0, heuristicValue = 0;

    const enrichedHoldings = holdings.map(h => {
      const w = parseFloat(h.value) / totalValue;
      const d = secData[h.ticker] || { loadings: DEFAULT_EQUITY_LOADINGS, specificVar: dailyVar(DEFAULT_EQUITY_SPEC_VOL), r2: 0, method: 'default' };
      for (let k = 0; k < N_FACTORS; k++) beta_p[k] += w * d.loadings[k];
      specVarPortfolio += w * w * d.specificVar * 252;
      if (d.method === 'regression') regressionValue += parseFloat(h.value);
      else heuristicValue += parseFloat(h.value);
      return { ...h, w, loadings: d.loadings, specificVar: d.specificVar, r2: d.r2, method: d.method };
    });

    // ── 10. Portfolio risk attribution ────────────────────────────────────────
    const Sigma_F_beta = matVec(Sigma_F, beta_p);           // Σ_F × β_p
    const sysVar = dot(beta_p, Sigma_F_beta);                // β_p' Σ_F β_p (annualized)
    const totalVar = sysVar + specVarPortfolio;
    const portfolioVol = Math.sqrt(totalVar) * 100;          // annualized vol, in %

    // Factor contributions to systematic variance
    const factors = FACTOR_NAMES.map((name, k) => {
      const contrib = beta_p[k] * Sigma_F_beta[k];
      return {
        name,
        exposure: round4(beta_p[k]),
        contribution_pct_systematic: round2(sysVar > 0 ? contrib / sysVar * 100 : 0),
        contribution_pct_total:      round2(totalVar > 0 ? contrib / totalVar * 100 : 0),
        expected_return_pct:         round3(beta_p[k] * FACTOR_PREMIUM[name] * 100),
      };
    });

    const expectedReturn = factors.reduce((s, f) => s + f.expected_return_pct, 0);
    const sharpe = portfolioVol > 0 ? (expectedReturn - RF * 100) / portfolioVol : 0;

    // ── 11. Holding-level risk contribution ───────────────────────────────────
    const topContributors = enrichedHoldings.map(h => {
      const sysContrib = dot(h.loadings, Sigma_F_beta) * h.w;
      const specContrib = h.w * h.w * h.specificVar * 252;
      const riskPct = totalVar > 0 ? (sysContrib + specContrib) / totalVar * 100 : 0;
      return {
        ticker: h.ticker,
        name: h.name,
        product_type: h.product_type,
        account_name: h.account_name,
        value: round2(parseFloat(h.value)),
        weight_pct: round2(h.w * 100),
        beta_to_market: round3(h.loadings[0]),
        risk_contribution_pct: round2(riskPct),
        r2: h.r2 !== null ? round1(h.r2 * 100) : null,
        method: h.method,
      };
    }).sort((a, b) => Math.abs(b.risk_contribution_pct) - Math.abs(a.risk_contribution_pct))
      .slice(0, 25);

    // ── 11b. Aggregated holding-level volatility by ticker ──────────────────
    const tickerAggMap = {};
    for (const h of enrichedHoldings) {
      const key = h.ticker;
      const sysContrib = dot(h.loadings, Sigma_F_beta) * h.w;
      const specContrib = h.w * h.w * h.specificVar * 252;
      const riskPct = totalVar > 0 ? (sysContrib + specContrib) / totalVar * 100 : 0;
      const Sigma_h = matVec(Sigma_F, h.loadings);
      const tickerVol = Math.sqrt(Math.max(0, dot(h.loadings, Sigma_h) + h.specificVar * 252)) * 100;

      if (!tickerAggMap[key]) {
        tickerAggMap[key] = {
          ticker: h.ticker,
          name: h.name,
          product_type: h.product_type || '',
          value: 0,
          weight_pct: 0,
          beta_to_market: round3(h.loadings[0]),
          vol_pct: round1(isFinite(tickerVol) ? tickerVol : 0),
          risk_contribution_pct: 0,
          r2: h.r2 !== null ? round1(h.r2 * 100) : null,
          method: h.method,
          n_accounts: 0,
          _accounts: new Set(),
        };
      }
      const row = tickerAggMap[key];
      row.value += parseFloat(h.value);
      row.weight_pct += h.w * 100;
      row.risk_contribution_pct += riskPct;
      if (h.account_name) row._accounts.add(h.account_name);
      if (!row.product_type && h.product_type) row.product_type = h.product_type;
    }
    const aggregatedHoldings = Object.values(tickerAggMap)
      .map(r => ({
        ticker: r.ticker,
        name: r.name,
        product_type: r.product_type,
        value: round2(r.value),
        weight_pct: round2(r.weight_pct),
        beta_to_market: r.beta_to_market,
        vol_pct: r.vol_pct,
        risk_contribution_pct: round2(r.risk_contribution_pct),
        r2: r.r2,
        method: r.method,
        n_accounts: r._accounts.size,
      }))
      .sort((a, b) => Math.abs(b.risk_contribution_pct) - Math.abs(a.risk_contribution_pct));

    // ── 12. Account-level risk ────────────────────────────────────────────────
    const acctMap = {};
    for (const h of enrichedHoldings) {
      const key = h.account_name || 'Unknown';
      if (!acctMap[key]) acctMap[key] = { value: 0, holdings: [] };
      acctMap[key].value += parseFloat(h.value);
      acctMap[key].holdings.push(h);
    }
    const accounts = Object.entries(acctMap).map(([name, acct]) => {
      const wAcct = acct.value / totalValue;
      // Account-level factor loadings (weighted average within account)
      const beta_acct = Array(N_FACTORS).fill(0);
      let specVarAcct = 0;
      for (const h of acct.holdings) {
        const w_in = parseFloat(h.value) / acct.value;
        for (let k = 0; k < N_FACTORS; k++) beta_acct[k] += w_in * h.loadings[k];
        specVarAcct += w_in * w_in * h.specificVar * 252;
      }
      // Standalone account volatility
      const Sigma_acct = matVec(Sigma_F, beta_acct);
      const acctVol = Math.sqrt(Math.max(0, dot(beta_acct, Sigma_acct) + specVarAcct)) * 100;
      // Contribution to portfolio risk (marginal × weight)
      const sysContrib = dot(beta_acct, Sigma_F_beta) * wAcct;
      const specContrib = wAcct * wAcct * specVarAcct;
      const riskPct = totalVar > 0 ? (sysContrib + specContrib) / totalVar * 100 : 0;
      return {
        account_name: name,
        value: round2(acct.value),
        weight_pct: round2(wAcct * 100),
        beta_to_market: round3(beta_acct[0]),
        vol_pct: round1(isFinite(acctVol) ? acctVol : 0),
        risk_contribution_pct: round2(riskPct),
        n_holdings: acct.holdings.length,
      };
    }).sort((a, b) => b.risk_contribution_pct - a.risk_contribution_pct);

    // ── 13. Build response ────────────────────────────────────────────────────
    const result = {
      computed_at: new Date().toISOString(),
      lookback_trading_days: commonDates.length,
      portfolio: {
        total_value: round2(totalValue),
        vol_pct:     round2(portfolioVol),
        systematic_pct: round1(totalVar > 0 ? sysVar / totalVar * 100 : 0),
        specific_pct:   round1(totalVar > 0 ? specVarPortfolio / totalVar * 100 : 0),
        expected_return_pct: round2(expectedReturn),
        sharpe: round3(sharpe),
        beta:   round3(beta_p[0]),
        risk_free_pct: RF * 100,
      },
      factors,
      accounts: accounts.slice(0, 20),
      aggregated_holdings: aggregatedHoldings,
      top_contributors: topContributors,
      data_quality: {
        regression_pct: round1(regressionValue / totalValue * 100),
        heuristic_pct:  round1(heuristicValue / totalValue * 100),
        default_pct:    round1((totalValue - regressionValue - heuristicValue) / totalValue * 100),
      },
    };

    _cache = result;
    _cacheAt = Date.now();
    res.json(result);
  } catch (err) {
    console.error('[Barra]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function dailyVar(annualVol) { return (annualVol / Math.sqrt(252)) ** 2; }
function round1(x) { return +x.toFixed(1); }
function round2(x) { return +x.toFixed(2); }
function round3(x) { return +x.toFixed(3); }
function round4(x) { return +x.toFixed(4); }

module.exports = router;
