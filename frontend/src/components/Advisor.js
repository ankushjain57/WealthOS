import { useState, useRef, useEffect } from 'react';
import { api } from '../api';

const SUGGESTIONS = [
  'Reduce my STT employer stock concentration',
  'How can I improve tax efficiency?',
  'Should I move JEPQ/JEPI into my IRA?',
  'Deploy my idle cash into T-bills',
  'What is my biggest risk right now?',
  'Rebalance my portfolio for retirement',
  'Harvest tax losses this year',
  'Add more international diversification',
];

function Message({ role, content }) {
  const isUser = role === 'user';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 14,
    }}>
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--ink)', color: 'var(--gold)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, flexShrink: 0, marginRight: 10, marginTop: 2,
        }}>W</div>
      )}
      <div style={{
        maxWidth: '75%',
        background: isUser ? 'var(--ink)' : 'var(--surface)',
        color: isUser ? '#fff' : 'var(--ink)',
        border: isUser ? 'none' : '1px solid var(--border)',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        padding: '11px 16px',
        fontSize: 13.5,
        lineHeight: 1.65,
        whiteSpace: 'pre-wrap',
        boxShadow: 'var(--sh)',
      }}>
        {content}
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
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--gold)', display: 'inline-block',
            animation: `dp 1.2s ease-in-out ${delay}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

export default function Advisor() {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
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

    // Send history without the portfolio-context prefix for subsequent turns
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const data = await api.chatAdvisor(userText, history);
      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
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
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="stitle">AI Advisor <small>Powered by Claude · Live portfolio context</small></div>

      {/* Suggestion chips — only shown before first message */}
      {isEmpty && (
        <div className="card mb18">
          <div className="card-title" style={{ marginBottom: 12 }}>What would you like to work on?</div>
          <div className="chips">
            {SUGGESTIONS.map(s => (
              <div key={s} className="chip" onClick={() => sendMessage(s)}>{s}</div>
            ))}
          </div>
        </div>
      )}

      {/* Chat window */}
      <div className="card mb18" style={{ minHeight: 360, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 520, padding: '4px 0' }}>
          {isEmpty && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, marginBottom: 6 }}>
                Ask me anything about your portfolio
              </div>
              <div style={{ fontSize: 12.5 }}>
                I have live access to your holdings, risk metrics, tax buckets, and account data.
              </div>
            </div>
          )}
          {messages.map((m, i) => <Message key={i} role={m.role} content={m.content} />)}
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

      {/* Input bar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about your portfolio, risk, tax strategy, rebalancing…"
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
        Press Enter to send · Shift+Enter for new line · Responses use live portfolio data
      </div>
    </div>
  );
}
