import { useState, useRef, useEffect } from 'react';
import { api } from '../api';

const SUGGESTIONS = [
  'What is my biggest risk right now? Search the news.',
  'What does the market say about my STT concentration?',
  'Should I move JEPQ/JEPI into my IRA? Find recent commentary.',
  'What are current T-bill rates? Should I deploy my idle cash?',
  'Analyze my portfolio vs current market conditions',
  'What is the latest analyst view on my top holdings?',
  'How is the S&P 500 doing today? Impact on my portfolio?',
  'Add 100 shares of VOO at $512',
  'Remove ROKU from my portfolio',
  'Harvest tax losses this year',
];

const ACTION_META = {
  add_holding:            { icon: '✅', color: 'var(--sage)',  bg: 'var(--sage-lt)',  label: 'Holding Added'   },
  delete_holding:         { icon: '🗑️', color: 'var(--red)',   bg: 'var(--red-lt)',   label: 'Holding Removed' },
  update_holding:         { icon: '✏️', color: 'var(--blue)',  bg: 'var(--blue-lt)',  label: 'Holding Updated' },
  add_account:            { icon: '✅', color: 'var(--sage)',  bg: 'var(--sage-lt)',  label: 'Account Added'   },
  delete_account:         { icon: '🗑️', color: 'var(--red)',   bg: 'var(--red-lt)',   label: 'Account Removed' },
  search_financial_news:  { icon: '📰', color: 'var(--blue)',  bg: 'var(--blue-lt)',  label: 'Financial News'  },
  get_market_data:        { icon: '📈', color: 'var(--gold)',  bg: '#fdf8ed',         label: 'Live Market Data'},
};

// ─── News card ─────────────────────────────────────────────────────────────────
function NewsCard({ action }) {
  const [expanded, setExpanded] = useState(true);
  const articles = action.news || [];
  if (!articles.length && action.ok) return null;
  return (
    <div style={{
      border: '1px solid var(--blue-lt)', borderRadius: 10,
      background: 'var(--surface)', marginBottom: 10, overflow: 'hidden',
      boxShadow: 'var(--sh)',
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '9px 14px', cursor: 'pointer',
          background: 'var(--blue-lt)', borderBottom: expanded ? '1px solid var(--border)' : 'none',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 6 }}>
          📰 News Search · <span style={{ fontWeight: 400, fontStyle: 'italic', color: 'var(--muted)' }}>"{action.query}"</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{articles.length} articles {expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ padding: '8px 0' }}>
          {!action.ok || !articles.length ? (
            <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--muted)' }}>No results found for this query.</div>
          ) : articles.map((art, i) => (
            <a
              key={i}
              href={art.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                padding: '8px 14px', gap: 10, textDecoration: 'none', color: 'inherit',
                borderBottom: i < articles.length - 1 ? '1px solid var(--border)' : 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--paper)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: 'var(--ink)', marginBottom: 2 }}>
                  {art.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)'}}>
                  {art.publisher} · {art.published}
                </div>
              </div>
              <span style={{ fontSize: 10, color: 'var(--blue)', flexShrink: 0, marginTop: 2 }}>↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Market data card ──────────────────────────────────────────────────────────
function MarketDataCard({ action }) {
  const [expanded, setExpanded] = useState(true);
  const [sort, setSort] = useState({ col: 'ticker', dir: 'asc' });
  const rows = action.data || [];
  if (!rows.length) return null;
  const fmtCap = v => !v ? '—' : v >= 1e12 ? `$${(v/1e12).toFixed(1)}T` : v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : `$${(v/1e6).toFixed(0)}M`;
  const fmtNum = (v, prefix='$') => v != null ? `${prefix}${typeof v === 'number' ? v.toLocaleString() : v}` : '—';

  const toggleSort = (col) => setSort(prev => ({ col, dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc' }));
  const sortedRows = [...rows].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const getVal = (r) => {
      switch (sort.col) {
        case 'ticker': return r.ticker || '';
        case 'name': return r.name || '';
        case 'price': return parseFloat(r.price) || 0;
        case 'change_pct': return parseFloat(r.change_pct) || 0;
        case 'pe_ratio': return parseFloat(r.pe_ratio) || 0;
        case 'range52': return (parseFloat(r.week52_high) || 0) - (parseFloat(r.week52_low) || 0);
        case 'analyst_target': return parseFloat(r.analyst_target) || 0;
        case 'dividend_yield': return parseFloat(r.dividend_yield) || 0;
        case 'market_cap': return parseFloat(r.market_cap) || 0;
        default: return '';
      }
    };
    const av = getVal(a);
    const bv = getVal(b);
    if (typeof av === 'string' || typeof bv === 'string') {
      return dir * String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
    }
    return dir * (av - bv);
  });

  const SortTh = ({ col, label, align }) => {
    const active = sort.col === col;
    return (
      <th
        style={{ padding: '6px 10px', textAlign: align, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => toggleSort(col)}
      >
        {label}{' '}
        <span style={{ opacity: active ? 1 : 0.25, fontSize: 9 }}>
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '▾'}
        </span>
      </th>
    );
  };

  return (
    <div style={{
      border: '1px solid #e8d88a', borderRadius: 10,
      background: 'var(--surface)', marginBottom: 10, overflow: 'hidden',
      boxShadow: 'var(--sh)',
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '9px 14px', cursor: 'pointer',
          background: '#fdf8ed', borderBottom: expanded ? '1px solid #e8d88a' : 'none',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--gold-dk)', display: 'flex', alignItems: 'center', gap: 6 }}>
          📈 Live Market Data · <span style={{ fontWeight: 400, fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{rows.map(r => r.ticker).join(', ')}</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{rows.length} tickers {expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--cream)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
                <SortTh col="ticker" label="Ticker" align="left" />
                <SortTh col="name" label="Name" align="left" />
                <SortTh col="price" label="Price" align="right" />
                <SortTh col="change_pct" label="Day %" align="right" />
                <SortTh col="pe_ratio" label="P/E" align="right" />
                <SortTh col="range52" label="52w Low–High" align="right" />
                <SortTh col="analyst_target" label="Analyst Target" align="right" />
                <SortTh col="dividend_yield" label="Yield" align="right" />
                <SortTh col="market_cap" label="Mkt Cap" align="right" />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((d, i) => {
                const chgColor = d.change_pct == null ? 'inherit' : d.change_pct >= 0 ? 'var(--sage)' : 'var(--red)';
                return (
                  <tr key={i} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 700, fontFamily: 'DM Mono, monospace', fontSize: 11.5 }}>{d.ticker}</td>
                    <td style={{ padding: '7px 10px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{d.name}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>${d.price?.toLocaleString()}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', color: chgColor }}>
                      {d.change_pct != null ? `${d.change_pct >= 0 ? '+' : ''}${d.change_pct}%` : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--muted)' }}>{d.pe_ratio ?? '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {d.week52_low != null && d.week52_high != null ? `$${d.week52_low}–$${d.week52_high}` : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', color: d.analyst_target > d.price ? 'var(--sage)' : 'var(--red)' }}>
                      {fmtNum(d.analyst_target)}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--muted)' }}>
                      {d.dividend_yield != null ? `${d.dividend_yield}%` : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--muted)' }}>{fmtCap(d.market_cap)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Generic action card ───────────────────────────────────────────────────────
function ActionCard({ action }) {
  if (action.action === 'search_financial_news') return <NewsCard action={action} />;
  if (action.action === 'get_market_data') return <MarketDataCard action={action} />;
  const meta = ACTION_META[action.action] || { icon: '⚡', color: 'var(--amber)', bg: 'var(--amber-lt)', label: 'DB Action' };
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      background: action.ok ? meta.bg : 'var(--red-lt)',
      border: `1px solid ${action.ok ? meta.color : 'var(--red)'}`,
      borderRadius: 8, padding: '9px 14px', marginBottom: 8, fontSize: 12.5,
    }}>
      <span style={{ fontSize: 16 }}>{action.ok ? meta.icon : '⚠️'}</span>
      <div>
        <span style={{ fontWeight: 700, color: action.ok ? meta.color : 'var(--red)', marginRight: 6 }}>
          {action.ok ? meta.label : 'Failed'}
        </span>
        {action.summary}
      </div>
    </div>
  );
}

function Message({ role, content, actions }) {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 14 }}>
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--ink)', color: 'var(--gold)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, flexShrink: 0, marginRight: 10, marginTop: 2,
        }}>W</div>
      )}
      <div style={{ maxWidth: '82%' }}>
        {/* Research cards (news + market data) shown above the reply bubble */}
        {actions && actions.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {actions.map((a, i) => <ActionCard key={i} action={a} />)}
          </div>
        )}
        <div style={{
          background: isUser ? 'var(--ink)' : 'var(--surface)',
          color: isUser ? '#fff' : 'var(--ink)',
          border: isUser ? 'none' : '1px solid var(--border)',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          padding: '11px 16px', fontSize: 13.5, lineHeight: 1.65,
          whiteSpace: 'pre-wrap', boxShadow: 'var(--sh)',
        }}>
          {content}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: 'var(--ink)', color: 'var(--gold)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 700, flexShrink: 0,
      }}>W</div>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '18px 18px 18px 4px', padding: '12px 18px',
        display: 'flex', gap: 5, alignItems: 'center',
      }}>
        {[0, 0.2, 0.4].map((delay, i) => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)',
            display: 'inline-block',
            animation: `dp 1.2s ease-in-out ${delay}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

export default function Advisor() {
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(text) {
    const userText = (text || input).trim();
    if (!userText || loading) return;
    setInput('');
    setError('');

    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setLoading(true);

    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const data = await api.chatAdvisor(userText, history);
      setMessages([...newMessages, { role: 'assistant', content: data.reply, actions: data.actions || [] }]);
    } catch (err) {
      setError('Could not reach the AI service. Make sure the backend is running and ANTHROPIC_API_KEY is set.');
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const isEmpty = messages.length === 0;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="stitle">
        AI Advisor
        <small>Claude · Live portfolio access · Real-time news &amp; market data</small>
      </div>

      {isEmpty && (
        <div className="card mb18">
          <div className="card-title" style={{ marginBottom: 12 }}>What would you like to know?</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 12 }}>
            I'll search financial news and fetch live market data before answering research questions.
          </div>
          <div className="chips">
            {SUGGESTIONS.map(s => (
              <div key={s} className="chip" onClick={() => sendMessage(s)}>{s}</div>
            ))}
          </div>
        </div>
      )}

      <div className="card mb18" style={{ minHeight: 360, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 560, padding: '4px 0' }}>
          {isEmpty && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, marginBottom: 6 }}>
                Ask me anything — I'll research before I answer
              </div>
              <div style={{ fontSize: 12.5 }}>
                I search Yahoo Finance news and fetch live market data to give you real-time perspective on your portfolio.
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <Message key={i} role={m.role} content={m.content} actions={m.actions} />
          ))}
          {loading && <TypingIndicator />}
          {error && (
            <div className="alert a-red" style={{ marginTop: 8 }}>
              <div className="alert-icon">⚠️</div>
              <div>{error}</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder='Ask about your portfolio, market conditions, or say "Add 50 shares of BND at $72" to make a change…'
          disabled={loading}
          rows={2}
          style={{
            flex: 1, padding: '11px 14px',
            border: '1px solid var(--border)', borderRadius: 8,
            fontFamily: "'DM Sans', sans-serif", fontSize: 13.5,
            color: 'var(--ink)', background: 'var(--surface)',
            outline: 'none', resize: 'none', lineHeight: 1.5,
          }}
        />
        <button
          className="btn btn-ink"
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          style={{ padding: '11px 22px', height: 'fit-content' }}
        >
          {loading ? '…' : 'Send →'}
        </button>
        {messages.length > 0 && (
          <button
            className="btn btn-outline"
            onClick={() => { setMessages([]); setError(''); }}
            disabled={loading}
            style={{ padding: '11px 14px', height: 'fit-content' }}
          >
            Clear
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>
        Enter to send · Shift+Enter for new line · DB writes are applied immediately
      </div>
    </div>
  );
}
