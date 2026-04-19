import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

export default function YodleeConnector({ onImportComplete }) {
  const [step,        setStep]        = useState('idle'); // idle | fastlink | accounts | holdings
  const [loginName,   setLoginName]   = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [fastLinkUrl, setFastLinkUrl] = useState(null);
  const [accounts,    setAccounts]    = useState([]);
  const [holdings,    setHoldings]    = useState([]);
  const [importing,   setImporting]   = useState(false);
  const [status,      setStatus]      = useState('');
  const iframeRef = useRef(null);

  // Listen for FastLink postMessage events
  useEffect(() => {
    function handleMessage(e) {
      if (!e.data || typeof e.data !== 'object') return;
      const { fnToCall, data } = e.data;
      if (fnToCall === 'close' || fnToCall === 'accountStatus') {
        // FastLink finished — load accounts
        setStep('accounts');
        loadAccounts(loginName);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loginName]);

  const connectToYodlee = async () => {
    setStatus('Connecting to Yodlee…');
    setStep('connecting');
    try {
      const result = await api.yodleeConnect({}); // Empty object — backend uses sandbox user from .env
      setLoginName(result.loginName);
      setAccessToken(result.accessToken);
      setFastLinkUrl(result.fastLinkUrl);
      setStatus('');
      setStep('fastlink');
    } catch (err) {
      setStatus('Connection failed: ' + err.message);
      setStep('idle');
    }
  };

  const loadAccounts = async (name) => {
    setStatus('Loading linked accounts…');
    try {
      const result = await api.yodleeGetAccounts(name);
      setAccounts(result.account || []);
      setStatus(`Found ${result.account?.length || 0} linked accounts`);
    } catch (err) {
      setStatus('Failed to get accounts: ' + err.message);
    }
  };

  const loadHoldings = async () => {
    if (!loginName) return;
    setStatus('Loading holdings…');
    setStep('holdings');
    try {
      const result = await api.yodleeGetHoldings(loginName);
      setHoldings(result.holdings || []);
      setStatus(`Loaded ${result.count} holdings`);
    } catch (err) {
      setStatus('Failed to load holdings: ' + err.message);
    }
  };

  const importHoldings = async () => {
    if (!loginName) return;
    setImporting(true);
    setStatus('Importing holdings to WealthOS…');
    try {
      const result = await api.yodleeImportHoldings(loginName, false);
      setStatus(result.message);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      setStatus('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const importDirect = async () => {
    setImporting(true);
    setStatus('Importing accounts from Yodlee sandbox…');
    try {
      const result = await api.yodleeImportDirect();
      setStatus(result.message + ` (${result.imported} accounts)`);
      setStep('idle');
      // Reset state
      setAccounts([]);
      setHoldings([]);
      setAccessToken(null);
      setLoginName(null);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      setStatus('Direct import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const redirectUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const fastLinkSrc = fastLinkUrl && accessToken
    ? `${fastLinkUrl}?token=${accessToken}&redirectUrl=${encodeURIComponent(redirectUrl)}`
    : null;

  return (
    <div style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 8, margin: '20px 0' }}>
      <h3 style={{ marginTop: 0 }}>🔗 Yodlee Account Aggregation</h3>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>
        Connect your financial accounts to automatically import positions using Yodlee FastLink 4.0.
      </p>

      {step === 'idle' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={connectToYodlee}>
            🔗 Connect Financial Accounts (FastLink)
          </button>
          <button className="btn btn-outline" onClick={importDirect} disabled={importing}>
            {importing ? '⟳ Importing…' : '📥 Quick Import (Test)'}
          </button>
        </div>
      )}

      {step === 'connecting' && (
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>⟳ Connecting…</div>
      )}

      {step === 'fastlink' && fastLinkSrc && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
            Link your accounts in the panel below, then close it when done.
          </p>
          <iframe
            ref={iframeRef}
            src={fastLinkSrc}
            title="Yodlee FastLink"
            width="100%"
            height="550"
            style={{ border: '1px solid var(--border)', borderRadius: 6 }}
            allow="camera; microphone"
          />
          <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={() => { setStep('accounts'); loadAccounts(loginName); }}>
            ✓ Done linking — load my accounts
          </button>
        </div>
      )}

      {(step === 'accounts' || step === 'holdings') && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <button className="btn btn-outline btn-sm" onClick={() => loadAccounts(loginName)}>
              🔍 Refresh Accounts
            </button>
            <button className="btn btn-outline btn-sm" onClick={loadHoldings} disabled={accounts.length === 0}>
              📊 Load Holdings
            </button>
            <button className="btn btn-primary btn-sm" onClick={importHoldings} disabled={importing || holdings.length === 0}>
              {importing ? '⟳ Importing…' : '💾 Import to WealthOS'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => { setStep('idle'); setAccounts([]); setHoldings([]); setAccessToken(null); setLoginName(null); }}>
              ＋ Link More Accounts
            </button>
          </div>

          {accounts.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ marginBottom: 6 }}>Linked Accounts ({accounts.length})</h4>
              <div style={{ maxHeight: 150, overflow: 'auto', fontSize: 13 }}>
                {accounts.map((acc, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <strong>{acc.providerName}</strong> — {acc.accountName} ({acc.accountType})
                  </div>
                ))}
              </div>
            </div>
          )}

          {holdings.length > 0 && (
            <div>
              <h4 style={{ marginBottom: 6 }}>Holdings Preview ({holdings.length})</h4>
              <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
                {holdings.slice(0, 10).map((h, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>{h.ticker} — {h.name}</span>
                    <span>{h.shares} × ${h.price} = ${Number(h.value).toLocaleString()}</span>
                  </div>
                ))}
                {holdings.length > 10 && <div style={{ color: 'var(--muted)', marginTop: 4 }}>…and {holdings.length - 10} more</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {status && (
        <div style={{
          padding: '8px 12px', borderRadius: 4, fontSize: 13, marginTop: 8,
          background: status.toLowerCase().includes('fail') ? '#fee' : '#efe',
          color:      status.toLowerCase().includes('fail') ? '#c33' : '#363',
          border: `1px solid ${status.toLowerCase().includes('fail') ? '#fcc' : '#cfc'}`
        }}>
          {status}
        </div>
      )}
    </div>
  );
}