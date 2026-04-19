import { useEffect, useState, useCallback } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { api, fmt } from '../api';
ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// ── Market Index Ticker Bar ───────────────────────────────────────────────────
function fmtPrice(price) {
  if (!price || isNaN(price) || price <= 0) return 'N/A';
  if (price >= 10000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (price >= 100)   return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function TickerRow({ items, speed, label }) {
  if (!items.length) return null;
  const duped = [...items, ...items];
  return (
    <div className="idx-ticker">
      {label && <span className="idx-row-lbl">{label}</span>}
      <div className="idx-track" style={{ animationDuration: speed }}>
        {duped.map((ix, i) => (
          <span key={i} className="idx-item">
            <span className="idx-lbl">{ix.label}</span>
            <span className="idx-price">{fmtPrice(ix.price)}</span>
            <span className={ix.change_pct >= 0 ? 'idx-up' : 'idx-dn'}>
              {ix.change_pct >= 0 ? '▲' : '▼'} {Math.abs(ix.change_pct).toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function IndexTicker({ topH }) {
  const [indexes,  setIndexes]  = useState([]);
  const [futures,  setFutures]  = useState([]);

  const loadAll = useCallback(() => {
    api.getIndexes().then(setIndexes).catch(() => {});
    api.getFutures().then(setFutures).catch(() => {});
  }, []);

  useEffect(() => { loadAll(); const t = setInterval(loadAll, 60000); return () => clearInterval(t); }, [loadAll]);

  // Holdings ticker items — use topH passed from Dashboard (already loaded)
  const holdingItems = topH
    .filter(h => !/^RE\d+$/i.test(h.ticker) && !['EIA_AXA','EIA_PWR'].includes(h.ticker))
    .filter(h => parseFloat(h.price) > 0)
    .slice(0, 10)
    .map(h => ({ label: h.ticker, price: parseFloat(h.price), change_pct: parseFloat(h.change_pct) || 0 }));

  return (
    <div style={{ marginBottom: 12 }}>
      {indexes.length > 0 && <TickerRow items={indexes}     speed="55s" label="INDICES" />}
      {futures.length > 0 && <TickerRow items={futures}     speed="48s" label="FUTURES" />}
      {holdingItems.length > 0 && <TickerRow items={holdingItems} speed="42s" label="MY TOP 10" />}
    </div>
  );
}

// ── Sortable table header cell ────────────────────────────────────────────────
function Th({ col, align, children, sort, onSort }) {
  const active = sort.col === col;
  return (
    <th className={align === 'r' ? 'r' : ''}
        style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
        onClick={() => onSort(col)}>
      {children}{' '}
      <span style={{ opacity: active ? 1 : 0.25, fontSize: 9 }}>
        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '▾'}
      </span>
    </th>
  );
}

// ── Expandable KPI tile ────────────────────────────────────────────────────────
function KpiTile({ label, value, sub, valClass, rows, tileKey, expanded, onToggle, refreshing }) {
  const hasRows = rows && rows.length > 0;
  return (
    <div
      className="kpi"
      style={{ cursor: hasRows ? 'pointer' : 'default', userSelect: 'none', opacity: refreshing ? 0.7 : 1 }}
      onClick={() => hasRows && onToggle(tileKey)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="kpi-lbl">{label}</div>
        {hasRows && (
          <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            {expanded ? '▲' : '▼'}
          </span>
        )}
      </div>
      <div className={`kpi-val${valClass ? ' ' + valClass : ''}`}>{refreshing ? '⟳' : value}</div>
      <div className="kpi-sub">{sub}</div>
      {expanded && hasRows && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
              <span style={{ flex: 1, marginRight: 8, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.label}
              </span>
              <span style={{ fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ onNetWorthUpdate }) {
  const [summary,     setSummary]     = useState(null);
  const [sectors,     setSectors]     = useState([]);
  const [topH,        setTopH]        = useState([]);
  const [accounts,    setAccounts]    = useState([]);
  const [allHoldings, setAllHoldings] = useState([]);
  const [reHoldings,  setReHoldings]  = useState([]);
  const [holdingsTotal, setHoldingsTotal] = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [refreshedAt,  setRefreshedAt]  = useState(null);
  const [refreshMsg,   setRefreshMsg]   = useState(null);
  const [expanded,     setExpanded]     = useState(new Set());
  const [hSort,        setHSort]        = useState({ col: 'value', dir: 'desc' });

  function sortHoldings(rows, { col, dir }) {
    const m = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (col === 'ticker') return m * a.ticker.localeCompare(b.ticker);
      if (col === 'name')   return m * (a.name || '').localeCompare(b.name || '');
      if (col === 'value')  return m * (parseFloat(a.value) - parseFloat(b.value));
      if (col === 'pct')    return m * (parseFloat(a.pct)   - parseFloat(b.pct));
      return 0;
    });
  }

  function handleHSort(col) {
    setHSort(prev => ({ col, dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc' }));
  }

  function toggleTile(key) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function loadDashboard() {
    return Promise.all([api.getSummary(), api.getSectors(), api.getConcentration(), api.getAccounts(), api.getHoldings()])
      .then(([s, sec, top, accts, holdings]) => {
        setSummary(s);
        setSectors(sec);
        setTopH(top);
        setAccounts(accts);
        setAllHoldings(holdings);
        // RE1/RE2/RE3 tickers represent real estate — stored in holdings, not accounts
        const reh = holdings.filter(h => /^RE\d+$/i.test(h.ticker));
        setReHoldings(reh);
        const allHoldingsVal = holdings.reduce((s, h) => s + parseFloat(h.value), 0);
        // Standalone accounts (non-MS/Fidelity/E*TRADE) appear as rows in Portfolio — add their balances
        const INVEST_INST = ['morgan stanley', 'fidelity', 'e*trade'];
        const standaloneAcctVal = accts
          .filter(a => !INVEST_INST.some(k => (a.institution || '').toLowerCase().includes(k)))
          .reduce((s, a) => s + parseFloat(a.balance), 0);
        const nw = allHoldingsVal + standaloneAcctVal;
        setHoldingsTotal(nw);
        if (onNetWorthUpdate && nw) onNetWorthUpdate(nw);
        setLoading(false);
      }).catch(() => setLoading(false));
  }

  useEffect(() => { loadDashboard(); }, []);

  // Auto-refresh dashboard every 5 minutes (300 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!refreshing) { // Don't auto-refresh if manual refresh is in progress
        loadDashboard();
      }
    }, 300000);
    return () => clearInterval(interval);
  }, [refreshing]);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const result = await api.refreshPrices();
      await loadDashboard(); // Reload all dashboard data with updated prices
      setRefreshedAt(new Date(result.refreshed_at || Date.now()));
      const failNote = result.failed?.length ? ` (${result.failed.join(', ')} not found)` : '';
      setRefreshMsg({ type: 'ok', text: `Updated ${result.updated} of ${result.total} positions${failNote}` });
    } catch (err) {
      setRefreshMsg({ type: 'err', text: 'Price refresh failed: ' + err.message });
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) return <div className="loading">Loading portfolio…</div>;

  // ── Derived values ────────────────────────────────────────────────────────
  const dayPL         = parseFloat(summary?.total_day1  || 0);

  // Institution-based classification rules:
  //   Investment: Morgan Stanley, Fidelity, E*TRADE (even if account holds cash)
  //   Cash/Savings: Goldman Sachs (Marcus), Affinity Credit Union, Wells Fargo, Treasury
  const INVESTMENT_INSTITUTIONS = ['morgan stanley', 'fidelity', 'e*trade'];
  const CASH_INSTITUTIONS       = ['goldman sachs', 'marcus', 'affinity', 'wells fargo', 'treasury'];

  const isInvestmentInstitution = (a) =>
    INVESTMENT_INSTITUTIONS.some(k => (a.institution||'').toLowerCase().includes(k));
  const isCashInstitution = (a) =>
    CASH_INSTITUTIONS.some(k => (a.institution||'').toLowerCase().includes(k)) ||
    (a.account_type||'').toLowerCase().includes('cash');
  const isCashProductType = (p) => {
    const t = (p || '').toLowerCase().trim();
    return t === 'cash' || t === 'cd';
  };

  // Account groupings
  const isAnnuity = (a) => (a.account_type||'').toLowerCase().includes('annuity');

  const standaloneAccts = accounts.filter(a => !isInvestmentInstitution(a));
  const plans529    = accounts.filter(a => a.tax_bucket === 'Tax-Free / Tax-Advantaged');
  const cashAccts   = standaloneAccts.filter(a => isCashProductType(a.product_type));
  const cashHoldings = allHoldings.filter(h => isCashProductType(h.product_type));
  const investHoldingsTotal = allHoldings
    .filter(h => !isCashProductType(h.product_type))
    .reduce((s, h) => s + parseFloat(h.value || 0), 0);
  const investStandaloneAcctTotal = standaloneAccts
    .filter(a => !isCashProductType(a.product_type))
    .reduce((s, a) => s + parseFloat(a.balance || 0), 0);
  const annuityAccts = accounts.filter(a => isAnnuity(a));
  const taxDeferred  = accounts.filter(a => a.tax_bucket === 'Tax-Deferred' && !isAnnuity(a));
  const taxableAccts = accounts.filter(a =>
    a.tax_bucket === 'Taxable' &&
    isInvestmentInstitution(a) &&
    !cashAccts.includes(a)
  );

  // Disjoint buckets for net worth math (must sum exactly to account total)
  const taxableInvestAccts = accounts.filter(a =>
    a.tax_bucket === 'Taxable' &&
    !cashAccts.includes(a) &&
    !annuityAccts.includes(a)
  );
  const otherAccts = accounts.filter(a =>
    !plans529.includes(a) &&
    !cashAccts.includes(a) &&
    !taxDeferred.includes(a) &&
    !annuityAccts.includes(a) &&
    !taxableInvestAccts.includes(a)
  );

  // Real estate comes from holdings table (RE1/RE2/RE3 tickers)
  const reTotal       = reHoldings.reduce((s, h) => s + parseFloat(h.value), 0);
  const total529          = plans529.reduce((s, a)         => s + parseFloat(a.balance), 0);
  const cashAccountsTotal = cashAccts.reduce((s, a)        => s + parseFloat(a.balance), 0);
  const cashHoldingsTotal = cashHoldings.reduce((s, h)     => s + parseFloat(h.value), 0);
  const cashTotal         = cashAccountsTotal + cashHoldingsTotal;
  const deferTotal        = taxDeferred.reduce((s, a)      => s + parseFloat(a.balance), 0);
  const annuityTotal      = annuityAccts.reduce((s, a)     => s + parseFloat(a.balance), 0);
  const taxableInvestTotal= taxableInvestAccts.reduce((s,a)=> s + parseFloat(a.balance), 0);
  const otherTotal        = otherAccts.reduce((s, a)       => s + parseFloat(a.balance), 0);
  const acctTotal         = accounts.reduce((s, a)         => s + parseFloat(a.balance), 0);
  const netWorth          = holdingsTotal || parseFloat(summary?.total_value || 0);
  const investTotal       = investHoldingsTotal + investStandaloneAcctTotal;

  const colors = ['#c9a84c','#2563a8','#4a6741','#c0392b','#8b5cf6','#f97316','#06b6d4','#84cc16','#ec4899','#a8c5e0'];

  // Rows for each expandable tile
  const nwRows = [
    { label: 'Taxable Investments',     value: fmt.dollar(taxableInvestTotal) },
    { label: 'Tax-Deferred (IRA/401k)', value: fmt.dollar(deferTotal) },
    { label: 'Annuities (IRA)',         value: fmt.dollar(annuityTotal) },
    { label: '529 Plans',               value: fmt.dollar(total529) },
    { label: 'Cash & Savings',          value: fmt.dollar(cashTotal) },
    { label: 'Other Accounts',          value: fmt.dollar(otherTotal) },
    { label: 'Real Estate',             value: fmt.dollar(reTotal) },
  ].filter(r => r.value !== fmt.dollar(0));

  const invRows      = topH.filter(h => !/^RE\d+$/i.test(h.ticker)).slice(0, 8)
                           .map(h => ({ label: `${h.ticker} — ${h.name}`, value: fmt.dollar(h.value) }));
  const cashRows     = [
    ...cashAccts.map(a => ({ label: `${a.account_name || a.institution} (Account)`, value: fmt.dollar(a.balance) })),
    ...cashHoldings.map(h => ({ label: `${h.ticker} — ${h.name}`, value: fmt.dollar(h.value) }))
  ];
  const reRows       = reHoldings.map(h   => ({ label: h.name,          value: fmt.dollar(h.value) }));
  const rows529      = plans529.map(a     => ({ label: a.account_name, value: fmt.dollar(a.balance) }));
  const deferRows    = taxDeferred.map(a  => ({ label: a.account_name, value: fmt.dollar(a.balance) }));
  const taxRows      = taxableAccts.map(a => ({ label: a.account_name, value: fmt.dollar(a.balance) }));
  const annuityRows  = annuityAccts.map(a => ({ label: `${a.institution} — ${a.account_name}`, value: fmt.dollar(a.balance) }));

  const sortedH = sortHoldings(topH, hSort);

  return (
    <div>
      {/* ── Market Index Ticker ── */}
      <IndexTicker topH={topH} />

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div className="stitle" style={{ margin: 0 }}>
          Dashboard <small>Portfolio snapshot · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</small>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {refreshedAt && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Last updated: {refreshedAt.toLocaleTimeString()}</span>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-xs" onClick={() => window.open('/api/portfolio/export/csv', '_blank')} title="Download CSV">
              📊
            </button>
            <button className="btn btn-outline btn-xs" onClick={() => window.open('/api/portfolio/export/excel', '_blank')} title="Download Excel">
              📈
            </button>
          </div>
          <button className="btn btn-outline btn-sm" onClick={handleRefresh} disabled={refreshing} style={{ minWidth: 160 }}>
            {refreshing ? '⟳ Updating prices…' : '⟳ Refresh Live Prices'}
          </button>
        </div>
      </div>

      {refreshMsg && (
        <div style={{ padding: '8px 14px', borderRadius: 7, marginBottom: 12, fontSize: 13,
          background: refreshMsg.type === 'ok' ? 'rgba(74,167,65,0.12)' : 'rgba(220,53,69,0.12)',
          color:      refreshMsg.type === 'ok' ? '#2d6a27' : '#b02a37',
          border:     `1px solid ${refreshMsg.type === 'ok' ? '#a3d9a0' : '#f5c6cb'}` }}>
          {refreshMsg.text}
        </div>
      )}

      {/* ── Row 1: Top-level KPIs ── */}
      <div className="g4 mb18">
        <KpiTile tileKey="nw"   label="Net Worth"       value={fmt.dollar(netWorth)}     sub="Click to see breakdown"             rows={nwRows}   expanded={expanded.has('nw')}   onToggle={toggleTile} refreshing={refreshing} />
        <KpiTile tileKey="inv"  label="Investments"     value={fmt.dollar(investTotal)} sub={`${summary?.position_count} positions`} rows={invRows}  expanded={expanded.has('inv')}  onToggle={toggleTile} refreshing={refreshing} />
        <KpiTile tileKey="pl"   label="Today's P&L"     value={fmt.sign(dayPL)}          sub="Across all holdings"               rows={[]}       expanded={false}                onToggle={toggleTile} valClass={dayPL >= 0 ? 'pos' : 'neg'} refreshing={refreshing} />
        <KpiTile tileKey="cash" label="Cash & Savings"  value={fmt.dollar(cashTotal)}    sub={`${cashAccts.length} accounts · ${cashHoldings.length} positions`}    rows={cashRows} expanded={expanded.has('cash')} onToggle={toggleTile} refreshing={refreshing} />
      </div>

      {/* ── Row 2: Asset-class KPIs ── */}
      <div className="g5 mb18">
        <KpiTile tileKey="re"      label="Real Estate"            value={fmt.dollar(reTotal)}       sub={`${reHoldings.length} properties`}      rows={reRows}       expanded={expanded.has('re')}      onToggle={toggleTile} refreshing={refreshing} />
        <KpiTile tileKey="529"     label="529 Plans"              value={fmt.dollar(total529)}      sub={`${plans529.length} plans`}             rows={rows529}      expanded={expanded.has('529')}     onToggle={toggleTile} refreshing={refreshing} />
        <KpiTile tileKey="taxbl"   label="Taxable Brokerage"      value={fmt.dollar(taxableAccts.reduce((s,a)=>s+parseFloat(a.balance),0))} sub={`${taxableAccts.length} accounts`}  rows={taxRows}      expanded={expanded.has('taxbl')}   onToggle={toggleTile} refreshing={refreshing} />
        <KpiTile tileKey="def"     label="Tax-Deferred IRA/401k"  value={fmt.dollar(deferTotal)}    sub={`${taxDeferred.length} accounts`}       rows={deferRows}    expanded={expanded.has('def')}     onToggle={toggleTile} refreshing={refreshing} />
        <KpiTile tileKey="annuity" label="Annuities"              value={fmt.dollar(annuityTotal)}  sub={`${annuityAccts.length} IRA annuities`} rows={annuityRows}  expanded={expanded.has('annuity')} onToggle={toggleTile} refreshing={refreshing} />
      </div>

      {/* ── Alerts ── */}
      <div className="mb18">
        <div className="alert a-red"><span>⚠️</span><div><strong>Concentration Risk:</strong> STT RSUs are ~7% of net worth — employer-stock single-name risk. Recommend sell-on-vest into VOO.</div></div>
        <div className="alert a-amber"><span>💡</span><div><strong>Income ETF Tax Drag:</strong> JEPQ + JEPI in taxable accounts generate ordinary income. Consider repositioning to IRA.</div></div>
        <div className="alert a-blue"><span>📊</span><div><strong>Idle Cash:</strong> {fmt.dollar(cashTotal)} in cash accounts. T-bills yield ~5.2% — deploying adds ~{fmt.dollar(cashTotal * 0.052)}/yr risk-free.</div></div>
      </div>

      {/* ── Charts ── */}
      <div className="g2 mb18">
        <div className="card">
          <div className="card-hdr">
            <div><div className="card-title">Sector Allocation</div><div className="card-sub">By estimated sector</div></div>
          </div>
          <div className="ch-wrap ch-md">
            <Doughnut
              data={{
                labels: sectors.slice(0, 10).map(s => s.sector),
                datasets: [{ data: sectors.slice(0, 10).map(s => s.value), backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'right', labels: { font: { size: 10.5 }, boxWidth: 11 } },
                  tooltip: { callbacks: { label: c => ` ${fmt.pct(c.raw / investTotal * 100)} — ${fmt.dollar(c.raw)}` } }
                }
              }}
            />
          </div>
        </div>
        <div className="card">
          <div className="card-hdr">
            <div><div className="card-title">Top 10 Holdings</div><div className="card-sub">By market value</div></div>
          </div>
          <div className="ch-wrap ch-md">
            <Bar
              data={{
                labels: topH.slice(0, 10).map(h => h.ticker),
                datasets: [{ data: topH.slice(0, 10).map(h => h.value), backgroundColor: '#c8a84b88', borderColor: '#c8a84b', borderWidth: 1 }]
              }}
              options={{
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { ticks: { callback: v => fmt.dollar(v), font: { size: 10 } } } }
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Top Holdings Table ── */}
      <div className="card">
        <div className="card-hdr">
          <div className="card-title">Top Holdings</div>
          <span className="bdg bdg-blue">{topH.length} positions</span>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <Th col="ticker" sort={hSort} onSort={handleHSort}>Ticker</Th>
                <Th col="name"   sort={hSort} onSort={handleHSort}>Name</Th>
                <Th col="value"  sort={hSort} onSort={handleHSort} align="r">Value</Th>
                <Th col="pct"    sort={hSort} onSort={handleHSort} align="r">Weight</Th>
              </tr>
            </thead>
            <tbody>
              {sortedH.map((h, i) => (
                <tr key={i}>
                  <td><span className="tkr">{h.ticker}</span></td>
                  <td className="txt">{h.name}</td>
                  <td className="r">{fmt.dollar(h.value)}</td>
                  <td className="r">{fmt.pct(h.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
