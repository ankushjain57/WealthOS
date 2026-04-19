import { useState, useEffect, useCallback } from 'react';
import { api, fmt } from '../api';

const ACTION_COLOR = { BUY: '#22c55e', SELL: '#ef4444', HOLD: '#94a3b8' };
const ACTION_BG    = { BUY: '#f0fdf4', SELL: '#fef2f2', HOLD: '#f8fafc' };

const ASSET_CLASSES = ['Equity', 'Bond', 'Alternatives', 'Cash', 'Crypto', 'Real Estate'];

export default function Rebalance() {
  const [plan,    setPlan]    = useState(null);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState(null);
  const [planSort, setPlanSort] = useState({ col: 'delta_value', dir: 'desc' });

  // Add-target form
  const [form, setForm] = useState({ ticker: '', target_pct: '', asset_class: 'Equity' });
  const [formErr, setFormErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [p, t] = await Promise.all([api.getRebalancePlan(), api.getRebalanceTargets()]);
      setPlan(p); setTargets(t);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAddTarget(e) {
    e.preventDefault(); setFormErr(null);
    const pct = parseFloat(form.target_pct);
    if (!form.ticker.trim()) return setFormErr('Ticker is required');
    if (isNaN(pct) || pct <= 0 || pct > 100) return setFormErr('Target % must be between 0 and 100');
    try {
      await api.setRebalanceTarget({ ticker: form.ticker.trim().toUpperCase(), target_pct: pct, asset_class: form.asset_class });
      setForm({ ticker: '', target_pct: '', asset_class: 'Equity' });
      await load();
    } catch (e) { setFormErr(e.message); }
  }

  async function handleDeleteTarget(ticker) {
    try { await api.deleteRebalanceTarget(ticker); await load(); }
    catch (e) { setError(e.message); }
  }

  async function handleExecute() {
    if (!window.confirm('Apply all BUY/SELL trades to update share counts in the portfolio?')) return;
    setExecuting(true); setExecResult(null);
    try {
      const result = await api.executeRebalance();
      setExecResult(result);
      await load();
    } catch (e) { setError(e.message); }
    finally { setExecuting(false); }
  }

  const totalTargetPct = plan?.totalTargetPct ?? 0;
  const pctOver = totalTargetPct > 100;
  const trades  = plan?.trades ?? [];
  const buyCount  = trades.filter(t => t.action === 'BUY').length;
  const sellCount = trades.filter(t => t.action === 'SELL').length;

  function togglePlanSort(col) {
    setPlanSort(prev => ({ col, dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc' }));
  }

  const sortedTrades = [...trades].sort((a, b) => {
    const dir = planSort.dir === 'asc' ? 1 : -1;
    const getVal = (row) => {
      if (planSort.col === 'ticker' || planSort.col === 'asset_class' || planSort.col === 'action') return row[planSort.col] || '';
      return parseFloat(row[planSort.col]) || 0;
    };
    const av = getVal(a);
    const bv = getVal(b);
    if (typeof av === 'string' || typeof bv === 'string') {
      return dir * String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
    }
    return dir * (av - bv);
  });

  const SortTh = ({ col, label, align = 'left' }) => {
    const active = planSort.col === col;
    return (
      <th
        style={{ padding: '0.4rem 0.5rem', textAlign: align, cursor: 'pointer', userSelect: 'none', whiteSpace:'nowrap' }}
        onClick={() => togglePlanSort(col)}
      >
        {label}{' '}
        <span style={{ opacity: active ? 1 : 0.25, fontSize: 9 }}>
          {active ? (planSort.dir === 'asc' ? '▲' : '▼') : '▾'}
        </span>
      </th>
    );
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem', fontWeight: 700 }}>Portfolio Rebalancing</h2>
      <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Set target allocations and compute the trades needed to reach them.
      </p>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {/* ── Add Target Form ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Set Target Allocation</h3>
        <form onSubmit={handleAddTarget} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Ticker</label>
            <input
              value={form.ticker}
              onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
              placeholder="e.g. JEPQ"
              style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.4rem 0.6rem', width: 90, fontSize: '0.9rem' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Target %</label>
            <input
              value={form.target_pct}
              onChange={e => setForm(f => ({ ...f, target_pct: e.target.value }))}
              placeholder="e.g. 10"
              type="number" min="0.01" max="100" step="0.01"
              style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.4rem 0.6rem', width: 80, fontSize: '0.9rem' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Asset Class</label>
            <select
              value={form.asset_class}
              onChange={e => setForm(f => ({ ...f, asset_class: e.target.value }))}
              style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.4rem 0.6rem', fontSize: '0.9rem' }}
            >
              {ASSET_CLASSES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <button type="submit" style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '0.45rem 1rem', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
            Set Target
          </button>
        </form>
        {formErr && <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.5rem' }}>{formErr}</p>}
      </div>

      {loading ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '3rem' }}>Loading rebalance plan…</p>
      ) : (
        <>
          {/* ── Target allocations list ── */}
          {targets.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Saved Targets</h3>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: pctOver ? '#dc2626' : '#22c55e' }}>
                  Total: {totalTargetPct}% {pctOver ? '⚠ over 100%' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {targets.map(t => (
                  <div key={t.ticker} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 700 }}>{t.ticker}</span>
                    <span style={{ color: '#0ea5e9', fontWeight: 600 }}>{t.target_pct}%</span>
                    <span style={{ color: '#94a3b8' }}>{t.asset_class}</span>
                    <button onClick={() => handleDeleteTarget(t.ticker)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, fontSize: '1rem', lineHeight: 1 }} title="Remove target">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Rebalance Plan ── */}
          {trades.length === 0 ? (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
              No target allocations set yet. Add targets above to see the rebalancing plan.
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.2rem', fontSize: '1rem', fontWeight: 600 }}>Rebalance Plan</h3>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Portfolio: {fmt.dollar(plan?.totalValue ?? 0)} &nbsp;·&nbsp;
                    <span style={{ color: '#22c55e', fontWeight: 600 }}>{buyCount} BUY</span> &nbsp;
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>{sellCount} SELL</span>
                  </span>
                </div>
                <button
                  onClick={handleExecute}
                  disabled={executing || buyCount + sellCount === 0}
                  style={{ background: executing ? '#94a3b8' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '0.45rem 1.1rem', fontWeight: 600, cursor: executing ? 'not-allowed' : 'pointer', fontSize: '0.9rem' }}
                >
                  {executing ? 'Applying…' : 'Execute Trades'}
                </button>
              </div>

              {execResult && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '0.6rem 0.9rem', marginBottom: '0.75rem', fontSize: '0.85rem', color: '#166534' }}>
                  ✓ Applied {execResult.applied?.length ?? 0} trades: {execResult.applied?.join(', ') || '—'}
                  {execResult.skipped?.length > 0 && ` · Skipped: ${execResult.skipped.join(', ')}`}
                </div>
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                    <th style={{ padding: '0.4rem 0.75rem 0.4rem 0', cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }} onClick={() => togglePlanSort('ticker')}>
                      Ticker <span style={{ opacity: planSort.col === 'ticker' ? 1 : 0.25, fontSize: 9 }}>{planSort.col === 'ticker' ? (planSort.dir === 'asc' ? '▲' : '▼') : '▾'}</span>
                    </th>
                    <SortTh col="asset_class" label="Asset Class" />
                    <SortTh col="current_value" label="Current" align="right" />
                    <SortTh col="target_value" label="Target" align="right" />
                    <SortTh col="delta_value" label="Delta ($)" align="right" />
                    <SortTh col="delta_shares" label="Delta Shares" align="right" />
                    <SortTh col="action" label="Action" align="center" />
                  </tr>
                </thead>
                <tbody>
                  {sortedTrades.map(t => (
                    <tr key={t.ticker} style={{ borderBottom: '1px solid #f1f5f9', background: ACTION_BG[t.action] }}>
                      <td style={{ padding: '0.5rem 0.75rem 0.5rem 0', fontWeight: 700 }}>{t.ticker}</td>
                      <td style={{ padding: '0.5rem', color: '#64748b' }}>{t.asset_class}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        <div>{fmt.dollar(t.current_value)}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{t.current_pct}%</div>
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        <div>{fmt.dollar(t.target_value)}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{t.target_pct}%</div>
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', color: t.delta_value >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                        {t.delta_value >= 0 ? '+' : ''}{fmt.dollar(t.delta_value)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', color: '#475569' }}>
                        {t.delta_shares != null ? `${t.delta_shares >= 0 ? '+' : ''}${t.delta_shares}` : '—'}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <span style={{
                          background: ACTION_COLOR[t.action] + '22',
                          color: ACTION_COLOR[t.action],
                          border: `1px solid ${ACTION_COLOR[t.action]}44`,
                          borderRadius: 5, padding: '0.15rem 0.6rem', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.05em'
                        }}>
                          {t.action}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
