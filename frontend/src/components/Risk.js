import { useEffect, useState } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { api, fmt } from '../api';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const FACTOR_COLORS = {
  Market:      '#2563a8',
  Value:       '#c9a84c',
  Momentum:    '#4a6741',
  Size:        '#8b5cf6',
  Quality:     '#06b6d4',
  FixedIncome: '#64748b',
  RealEstate:  '#f97316',
  Crypto:      '#f59e0b',
  Specific:    '#e2e8f0',
};

const SECTOR_COLORS = ['#c9a84c','#2563a8','#4a6741','#c0392b','#8b5cf6','#f97316','#06b6d4','#84cc16','#ec4899','#a8c5e0'];

// ─── Overview sub-component ───────────────────────────────────────────────────
function Overview({ metrics, sectors, conc }) {
  const total = conc.reduce((s, h) => s + parseFloat(h.value), 0);
  const b  = parseFloat(metrics?.beta      || 1);
  const h  = parseFloat(metrics?.hhi       || 0);
  const v  = parseFloat(metrics?.volatility || 0);
  const sh = parseFloat(metrics?.sharpe    || 0);

  const factors = [
    { lbl: 'STT Employer Concentration', sev: 'High',     desc: `STT is ~${fmt.pct((conc.find(x => x.ticker === 'STT')?.value || 946411) / total * 100)} of your portfolio. Recommend sell-on-vest into VOO.` },
    { lbl: 'JEPQ/JEPI Tax Drag',         sev: 'High',     desc: 'Covered-call ETFs in taxable accounts generate ordinary income. Consider repositioning to IRA — saves $24K–$32K/yr.' },
    { lbl: 'Equity Beta Exposure',        sev: 'Medium',   desc: `Beta ${b.toFixed(2)}. In a S&P −20% drawdown, estimated loss: ${fmt.dollar(total * b * 0.20)}.` },
    { lbl: 'Idle Cash Drag',              sev: 'Medium',   desc: '$1.78M in savings at ~2%. T-bills yield ~5.2%. Opportunity cost: ~$57K/yr.' },
    { lbl: 'HHI Concentration',           sev: h > 2000 ? 'High' : 'Medium', desc: `HHI ${Math.round(h).toLocaleString()}. ${h > 2500 ? 'Significantly concentrated — top 3 positions = 27%.' : 'Moderate concentration.'}` },
    { lbl: 'Gold Inflation Hedge',         sev: 'Positive', desc: 'SLV + GLDM + GLD provide effective hedge in inflation surge and risk-off scenarios.' },
  ];
  const sevClass = { High: 'bdg-red', Medium: 'bdg-amber', Positive: 'bdg-sage' };

  return (
    <>
      <div className="g4 mb18">
        <div className="kpi"><div className="kpi-lbl">Portfolio Beta</div><div className={`kpi-val ${b > 1.2 ? 'neg' : b < 0.8 ? 'pos' : ''}`}>{b.toFixed(2)}</div><div className="kpi-sub">vs. S&amp;P 500 (1.0)</div></div>
        <div className="kpi"><div className="kpi-lbl">HHI Concentration</div><div className={`kpi-val ${h > 2500 ? 'neg' : ''}`}>{Math.round(h).toLocaleString()}</div><div className="kpi-sub">&lt;1500 = diversified</div></div>
        <div className="kpi"><div className="kpi-lbl">Est. Annual Volatility</div><div className="kpi-val">{v.toFixed(1)}%</div><div className="kpi-sub">Annualized</div></div>
        <div className="kpi"><div className="kpi-lbl">Sharpe Ratio Est.</div><div className={`kpi-val ${sh > 1 ? 'pos' : sh < 0.5 ? 'neg' : ''}`}>{sh.toFixed(2)}</div><div className="kpi-sub">&gt;1.0 = attractive</div></div>
      </div>
      <div className="g2 mb18">
        <div className="card">
          <div className="card-hdr"><div><div className="card-title">Sector Breakdown</div><div className="card-sub">By estimated sector</div></div></div>
          <div className="ch-wrap ch-md"><Doughnut data={{ labels: sectors.slice(0, 10).map(s => s.sector), datasets: [{ data: sectors.slice(0, 10).map(s => s.value), backgroundColor: SECTOR_COLORS, borderWidth: 2, borderColor: '#fff' }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 10.5 }, boxWidth: 11 } } } }} /></div>
        </div>
        <div className="card">
          <div className="card-hdr"><div className="card-title">Concentration Map</div></div>
          {conc.filter(h => h.pct > 1).map((h, i) => { const clr = h.pct > 8 ? 'var(--red)' : h.pct > 5 ? 'var(--amber)' : 'var(--gold)'; return (<div key={i} className="row-m"><span className="lbl"><span className="tkr">{h.ticker}</span></span><div className="pb"><div className="pb-fill" style={{ width: `${Math.min(h.pct * 6, 100)}%`, background: clr }} /></div><span className="val" style={{ color: clr }}>{fmt.pct(h.pct)}</span></div>); })}
        </div>
      </div>
      <div className="card">
        <div className="card-title">Risk Factor Analysis</div>
        {factors.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, padding: '11px 0', borderBottom: i < factors.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}>
            <div style={{ width: 195, flexShrink: 0, fontSize: 13, fontWeight: 600 }}>{f.lbl}</div>
            <span className={`bdg ${sevClass[f.sev] || 'bdg-blue'}`} style={{ flexShrink: 0 }}>{f.sev}</span>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Barra sub-component ──────────────────────────────────────────────────────
function BarraAnalysis() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [indexes,    setIndexes]    = useState([]);
  const [futures,    setFutures]    = useState([]);
  const [factorSort, setFactorSort] = useState({ col: 'contribution_pct_total', dir: 'desc' });
  const [accountSort, setAccountSort] = useState({ col: 'risk_contribution_pct', dir: 'desc' });
  const [aggSort, setAggSort] = useState({ col: 'risk_contribution_pct', dir: 'desc' });
  const [contribSort, setContribSort] = useState({ col: 'risk_contribution_pct', dir: 'desc' });

  const load = () => {
    setLoading(true); setError(null);
    Promise.allSettled([api.getBarra(), api.getIndexes(), api.getFutures()])
      .then(([barraRes, idxRes, futRes]) => {
        if (barraRes.status !== 'fulfilled') throw new Error(barraRes.reason?.message || 'Failed to load Barra data');
        setData(barraRes.value);
        setIndexes(idxRes.status === 'fulfilled' ? idxRes.value : []);
        setFutures(futRes.status === 'fulfilled' ? futRes.value : []);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(load, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await api.refreshBarra();
    setRefreshing(false);
    load();
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Computing Barra factor model…</div>
      <div style={{ fontSize: 12 }}>Fetching ~180 days of market data and running OLS factor regressions. First load takes 30–60 seconds.</div>
    </div>
  );

  if (error) return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ color: 'var(--red)', fontWeight: 600, marginBottom: 10 }}>Model computation failed</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>{error}</div>
      <button className="btn" onClick={load}>Retry</button>
    </div>
  );

  const { portfolio: p, factors, accounts, aggregated_holdings: aggH = [], top_contributors: topC, data_quality: dq, computed_at, lookback_trading_days } = data;
  const computedAgo = Math.round((Date.now() - new Date(computed_at).getTime()) / 60000);
  const methodBadge = m => ({ regression: 'bdg-sage', heuristic: 'bdg-blue', default: 'bdg-amber' })[m] || 'bdg-amber';

  const toggleSort = (setter, col) => {
    setter(prev => ({ col, dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc' }));
  };

  const sortRows = (rows, sort) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sort.col];
      const bv = b[sort.col];
      if (typeof av === 'string' || typeof bv === 'string' || av == null || bv == null) {
        return dir * String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      }
      return dir * ((parseFloat(av) || 0) - (parseFloat(bv) || 0));
    });
  };

  const SortTh = ({ sort, setSort, col, label, align = 'left' }) => {
    const active = sort.col === col;
    return (
      <th
        style={{ textAlign: align, padding: '6px 8px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
        onClick={() => toggleSort(setSort, col)}
      >
        {label}{' '}
        <span style={{ opacity: active ? 1 : 0.25, fontSize: 9 }}>
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '▾'}
        </span>
      </th>
    );
  };

  const sortedFactors = sortRows(factors, factorSort);
  const sortedAccounts = sortRows(accounts, accountSort);
  const sortedAggH = sortRows(aggH, aggSort);
  const sortedTopC = sortRows(topC, contribSort);

  const benchmarkPreference = ['S&P 500', 'NASDAQ 100', 'RUSSELL 2K', 'DOW', 'MSCI World', 'VIX', '10Y NOTE FUT', 'GOLD FUT'];
  const benchmarkMap = new Map([...(indexes || []), ...(futures || [])].map(b => [b.label, b]));
  const keyBenchmarks = benchmarkPreference.map(lbl => benchmarkMap.get(lbl)).filter(Boolean);

  const FACTOR_PREMIUMS_DISPLAY = { Market: '10.0%', Value: '2.5%', Momentum: '4.5%', Size: '2.0%', Quality: '3.0%', FixedIncome: '4.5%', RealEstate: '1.5%', Crypto: '0.0%' };

  const exposureChart = {
    labels: factors.map(f => f.name),
    datasets: [{ label: 'Factor Loading (β)', data: factors.map(f => f.exposure), backgroundColor: factors.map(f => f.exposure >= 0 ? FACTOR_COLORS[f.name] : '#ef4444'), borderRadius: 4 }],
  };
  const barOptions = {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` β = ${ctx.parsed.x.toFixed(3)}` } } },
    scales: { x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } }, y: { ticks: { font: { size: 11 } } } },
  };

  const riskDecompChart = {
    labels: [...factors.map(f => f.name), 'Specific (Idiosyncratic)'],
    datasets: [{ data: [...factors.map(f => Math.max(0, f.contribution_pct_total)), p.specific_pct], backgroundColor: [...factors.map(f => FACTOR_COLORS[f.name]), FACTOR_COLORS.Specific], borderWidth: 2, borderColor: '#fff' }],
  };
  const donutOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 }, boxWidth: 11 } } } };

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Barra Multi-Factor Risk Model — 8 Factors</div>
          <div className="card-sub" style={{ marginTop: 3 }}>
            {lookback_trading_days} trading days · {dq.regression_pct}% OLS regression · {dq.heuristic_pct}% heuristic · {dq.default_pct}% default ·
            Computed {computedAgo < 2 ? 'just now' : `${computedAgo} min ago`}
          </div>
        </div>
        <button className="btn" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh Model'}
        </button>
      </div>

      {/* Key Market Benchmarks */}
      {keyBenchmarks.length > 0 && (
        <div className="card mb18">
          <div className="card-hdr"><div className="card-title">Key Market Benchmarks</div></div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10 }}>
            {keyBenchmarks.map((b, i) => (
              <div key={i} style={{ border:'1px solid var(--border)', borderRadius:8, padding:'9px 10px', background:'var(--surface)' }}>
                <div style={{ fontSize:10.5, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{b.label}</div>
                <div style={{ fontFamily:'DM Mono, monospace', fontSize:15, fontWeight:700, margin:'4px 0' }}>
                  {Number(b.price || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </div>
                <div className={Number(b.change_pct || 0) >= 0 ? 'pos' : 'neg'} style={{ fontSize:12, fontWeight:600 }}>
                  {Number(b.change_pct || 0) >= 0 ? '+' : ''}{Number(b.change_pct || 0).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI tiles */}
      <div className="g4 mb18">
        <div className="kpi">
          <div className="kpi-lbl">Portfolio Volatility</div>
          <div className={`kpi-val ${p.vol_pct > 20 ? 'neg' : p.vol_pct < 10 ? 'pos' : ''}`}>{p.vol_pct.toFixed(1)}%</div>
          <div className="kpi-sub">Annualized · Market β = {p.beta.toFixed(2)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Systematic Risk</div>
          <div className="kpi-val">{p.systematic_pct.toFixed(0)}%</div>
          <div className="kpi-sub">Factor-driven · {p.specific_pct.toFixed(0)}% idiosyncratic</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Expected Annual Return</div>
          <div className={`kpi-val ${p.expected_return_pct > 8 ? 'pos' : ''}`}>{p.expected_return_pct.toFixed(1)}%</div>
          <div className="kpi-sub">Rf = {p.risk_free_pct.toFixed(1)}% · Factor premia</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Sharpe Ratio</div>
          <div className={`kpi-val ${p.sharpe > 1 ? 'pos' : p.sharpe < 0.5 ? 'neg' : ''}`}>{p.sharpe.toFixed(2)}</div>
          <div className="kpi-sub">Excess return per unit of vol</div>
        </div>
      </div>

      {/* Factor exposure + risk decomp side by side */}
      <div className="g2 mb18">
        <div className="card">
          <div className="card-hdr"><div><div className="card-title">Factor Exposures (β)</div><div className="card-sub">Portfolio loading on each Barra-style factor</div></div></div>
          <div style={{ height: 270 }}><Bar data={exposureChart} options={barOptions} /></div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Positive = tilt toward factor · Negative = tilt away · Market β ≈ 1.0 = full market exposure</div>
        </div>
        <div className="card">
          <div className="card-hdr"><div><div className="card-title">Risk Decomposition</div><div className="card-sub">% of total portfolio variance by factor</div></div></div>
          <div style={{ height: 220 }}><Doughnut data={riskDecompChart} options={donutOptions} /></div>
          <div style={{ fontSize: 11.5, marginTop: 14 }}>
            {factors.filter(f => Math.abs(f.contribution_pct_total) > 0.5).sort((a, b) => b.contribution_pct_total - a.contribution_pct_total).map((f, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: FACTOR_COLORS[f.name], display: 'inline-block' }} />
                  {f.name}
                </span>
                <span style={{ color: 'var(--muted)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>β={f.exposure.toFixed(3)} · {f.contribution_pct_total.toFixed(1)}%</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', marginTop: 2 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: '#cbd5e1', border: '1px solid #ccc', display: 'inline-block' }} />
                Specific (Idiosyncratic)
              </span>
              <span style={{ color: 'var(--muted)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{p.specific_pct.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Return Attribution table */}
      <div className="card mb18">
        <div className="card-hdr">
          <div className="card-title">Expected Return Attribution</div>
          <div className="card-sub">Factor contribution to {p.expected_return_pct.toFixed(1)}% expected annual return · E[R] = Σ β_k × premium_k</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <SortTh sort={factorSort} setSort={setFactorSort} col="name" label="Factor" />
              <SortTh sort={factorSort} setSort={setFactorSort} col="exposure" label="Exposure (β)" align="right" />
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>Factor Premium</th>
              <SortTh sort={factorSort} setSort={setFactorSort} col="expected_return_pct" label="Return Contrib." align="right" />
              <SortTh sort={factorSort} setSort={setFactorSort} col="contribution_pct_total" label="Risk Contrib." align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedFactors.map((f, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 8px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: FACTOR_COLORS[f.name], flexShrink: 0, display: 'inline-block' }} />
                    {f.name}
                  </span>
                </td>
                <td style={{ textAlign: 'right', padding: '7px 8px', fontFamily: 'DM Mono, monospace', color: f.exposure < 0 ? 'var(--red)' : 'inherit' }}>{f.exposure.toFixed(3)}</td>
                <td style={{ textAlign: 'right', padding: '7px 8px', color: 'var(--muted)' }}>{FACTOR_PREMIUMS_DISPLAY[f.name]}</td>
                <td style={{ textAlign: 'right', padding: '7px 8px', fontFamily: 'DM Mono, monospace', color: f.expected_return_pct >= 0 ? 'var(--sage)' : 'var(--red)' }}>
                  {f.expected_return_pct >= 0 ? '+' : ''}{f.expected_return_pct.toFixed(2)}%
                </td>
                <td style={{ textAlign: 'right', padding: '7px 8px', color: 'var(--muted)' }}>{f.contribution_pct_total.toFixed(1)}%</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 600, borderTop: '2px solid var(--border)' }}>
              <td style={{ padding: '8px 8px' }} colSpan={3}>Total</td>
              <td style={{ textAlign: 'right', padding: '8px 8px', fontFamily: 'DM Mono, monospace', color: 'var(--sage)' }}>+{p.expected_return_pct.toFixed(2)}%</td>
              <td style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--muted)' }}>~{(100 - p.specific_pct).toFixed(0)}% sys</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Account risk table */}
      <div className="card mb18">
        <div className="card-hdr">
          <div className="card-title">Risk by Account</div>
          <div className="card-sub">Standalone volatility and marginal contribution to portfolio risk</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <SortTh sort={accountSort} setSort={setAccountSort} col="account_name" label="Account" />
              <SortTh sort={accountSort} setSort={setAccountSort} col="value" label="Value" align="right" />
              <SortTh sort={accountSort} setSort={setAccountSort} col="weight_pct" label="Weight" align="right" />
              <SortTh sort={accountSort} setSort={setAccountSort} col="beta_to_market" label="Mkt Beta" align="right" />
              <SortTh sort={accountSort} setSort={setAccountSort} col="vol_pct" label="Acct Vol" align="right" />
              <SortTh sort={accountSort} setSort={setAccountSort} col="risk_contribution_pct" label="Portfolio Risk Contrib." align="right" />
              <SortTh sort={accountSort} setSort={setAccountSort} col="n_holdings" label="Holdings" align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedAccounts.map((a, i) => {
              const barW  = Math.max(2, Math.min(a.risk_contribution_pct * 4, 100));
              const barClr = a.risk_contribution_pct > 25 ? 'var(--red)' : a.risk_contribution_pct > 10 ? 'var(--amber)' : 'var(--gold)';
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 8px', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.account_name}</td>
                  <td style={{ textAlign: 'right', padding: '7px 8px', fontFamily: 'DM Mono, monospace' }}>{fmt.dollar(a.value)}</td>
                  <td style={{ textAlign: 'right', padding: '7px 8px', color: 'var(--muted)' }}>{a.weight_pct.toFixed(1)}%</td>
                  <td style={{ textAlign: 'right', padding: '7px 8px', fontFamily: 'DM Mono, monospace', color: a.beta_to_market > 1.2 ? 'var(--red)' : 'inherit' }}>{a.beta_to_market.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', padding: '7px 8px', fontFamily: 'DM Mono, monospace' }}>{a.vol_pct.toFixed(1)}%</td>
                  <td style={{ padding: '7px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                      <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${barW}%`, height: '100%', background: barClr, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: barClr, minWidth: 38, textAlign: 'right' }}>{a.risk_contribution_pct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', padding: '7px 8px', color: 'var(--muted)' }}>{a.n_holdings}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Top risk contributors */}
      <div className="card mb18">
        <div className="card-hdr">
          <div>
            <div className="card-title">Aggregated Holdings Volatility (Ticker-Level)</div>
            <div className="card-sub">Ticker aggregated across all accounts with standalone annualized volatility and risk contribution</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-outline btn-xs"
              onClick={() => setAggSort({ col: 'risk_contribution_pct', dir: 'desc' })}
              style={aggSort.col === 'risk_contribution_pct' ? { background: 'var(--blue)', color: '#fff', border: 'none' } : {}}
            >
              Sort: Risk
            </button>
            <button
              className="btn btn-outline btn-xs"
              onClick={() => setAggSort({ col: 'vol_pct', dir: 'desc' })}
              style={aggSort.col === 'vol_pct' ? { background: 'var(--blue)', color: '#fff', border: 'none' } : {}}
            >
              Sort: Volatility
            </button>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <SortTh sort={aggSort} setSort={setAggSort} col="ticker" label="Ticker / Name" />
              <SortTh sort={aggSort} setSort={setAggSort} col="product_type" label="Product" />
              <SortTh sort={aggSort} setSort={setAggSort} col="value" label="Value" align="right" />
              <SortTh sort={aggSort} setSort={setAggSort} col="weight_pct" label="Weight" align="right" />
              <SortTh sort={aggSort} setSort={setAggSort} col="beta_to_market" label="Mkt Beta" align="right" />
              <SortTh sort={aggSort} setSort={setAggSort} col="vol_pct" label="Volatility" align="right" />
              <SortTh sort={aggSort} setSort={setAggSort} col="risk_contribution_pct" label="Risk Contrib." align="right" />
              <SortTh sort={aggSort} setSort={setAggSort} col="n_accounts" label="Accounts" align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedAggH.slice(0, 30).map((h, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 8px' }}>
                  <span style={{ fontWeight: 700, fontFamily: 'DM Mono, monospace', fontSize: 12, marginRight: 6 }}>{h.ticker}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{(h.name || '').slice(0, 28)}</span>
                </td>
                <td style={{ padding: '7px 8px', color: 'var(--muted)', fontSize: 11.5 }}>{h.product_type || '—'}</td>
                <td style={{ textAlign: 'right', padding: '7px 8px', fontFamily: 'DM Mono, monospace' }}>{fmt.dollar(h.value)}</td>
                <td style={{ textAlign: 'right', padding: '7px 8px', color: 'var(--muted)' }}>{h.weight_pct.toFixed(2)}%</td>
                <td style={{ textAlign: 'right', padding: '7px 8px', fontFamily: 'DM Mono, monospace' }}>{h.beta_to_market.toFixed(2)}</td>
                <td style={{ textAlign: 'right', padding: '7px 8px', fontFamily: 'DM Mono, monospace' }}>{h.vol_pct.toFixed(1)}%</td>
                <td style={{ textAlign: 'right', padding: '7px 8px', fontFamily: 'DM Mono, monospace' }}>{h.risk_contribution_pct.toFixed(1)}%</td>
                <td style={{ textAlign: 'right', padding: '7px 8px', color: 'var(--muted)' }}>{h.n_accounts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-hdr">
          <div className="card-title">Top Risk Contributors</div>
          <div className="card-sub">Holdings ranked by marginal contribution to portfolio volatility (systematic + specific)</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <SortTh sort={contribSort} setSort={setContribSort} col="ticker" label="Ticker / Name" />
              <SortTh sort={contribSort} setSort={setContribSort} col="product_type" label="Product" />
              <SortTh sort={contribSort} setSort={setContribSort} col="account_name" label="Account" />
              <SortTh sort={contribSort} setSort={setContribSort} col="weight_pct" label="Weight" align="right" />
              <SortTh sort={contribSort} setSort={setContribSort} col="beta_to_market" label="Mkt Beta" align="right" />
              <SortTh sort={contribSort} setSort={setContribSort} col="risk_contribution_pct" label="Risk Contrib." align="right" />
              <SortTh sort={contribSort} setSort={setContribSort} col="r2" label="R²" align="right" />
              <SortTh sort={contribSort} setSort={setContribSort} col="method" label="Model" align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedTopC.map((h, i) => {
              const barW   = Math.max(2, Math.min(Math.abs(h.risk_contribution_pct) * 6, 100));
              const barClr = h.risk_contribution_pct > 10 ? 'var(--red)' : h.risk_contribution_pct > 5 ? 'var(--amber)' : '#a8c5e0';
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 8px' }}>
                    <span style={{ fontWeight: 700, fontFamily: 'DM Mono, monospace', fontSize: 12, marginRight: 6 }}>{h.ticker}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{(h.name || '').slice(0, 28)}</span>
                  </td>
                  <td style={{ padding: '7px 8px', color: 'var(--muted)', fontSize: 11.5 }}>{h.product_type || '—'}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--muted)', fontSize: 11.5, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.account_name}</td>
                  <td style={{ textAlign: 'right', padding: '7px 8px', color: 'var(--muted)' }}>{h.weight_pct.toFixed(2)}%</td>
                  <td style={{ textAlign: 'right', padding: '7px 8px', fontFamily: 'DM Mono, monospace', color: h.beta_to_market > 1.3 ? 'var(--red)' : 'inherit' }}>{h.beta_to_market.toFixed(2)}</td>
                  <td style={{ padding: '7px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                      <div style={{ width: 50, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${barW}%`, height: '100%', background: barClr, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, minWidth: 38, textAlign: 'right' }}>{h.risk_contribution_pct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', padding: '7px 8px', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>{h.r2 !== null ? `${h.r2}%` : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '7px 8px' }}><span className={`bdg ${methodBadge(h.method)}`}>{h.method}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 14, fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
          <strong>Model:</strong>&nbsp;
          <span className="bdg bdg-sage" style={{ fontSize: 10 }}>regression</span> OLS fit on 60+ days of history · &nbsp;
          <span className="bdg bdg-blue" style={{ fontSize: 10 }}>heuristic</span> fixed loadings (real estate, target-date funds, money market) · &nbsp;
          <span className="bdg bdg-amber" style={{ fontSize: 10 }}>default</span> generic equity β=0.9 used when insufficient history
        </div>
      </div>
    </>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────
export default function Risk() {
  const [tab,     setTab]     = useState('overview');
  const [metrics, setMetrics] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [conc,    setConc]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getMetrics(), api.getSectors(), api.getConcentration()])
      .then(([m, s, c]) => { setMetrics(m); setSectors(s); setConc(c); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Computing risk metrics…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
        <div className="stitle">
          Risk &amp; Volatility
          <small>{tab === 'overview' ? 'Heuristic estimates · March 2026' : '8-Factor Barra Model · Live market data'}</small>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ id: 'overview', label: 'Overview' }, { id: 'barra', label: 'Barra Factor Analysis' }].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '6px 16px', borderRadius: 20, fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', border: 'none', transition: 'all .15s',
                background: tab === t.id ? 'var(--blue)' : 'var(--border)',
                color: tab === t.id ? '#fff' : 'var(--text)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview'
        ? <Overview metrics={metrics} sectors={sectors} conc={conc} />
        : <BarraAnalysis />
      }
    </div>
  );
}
