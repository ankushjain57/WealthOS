const BASE = '/api';
async function get(path) { const r = await fetch(BASE+path); if (!r.ok) throw new Error(await r.text()); return r.json(); }
async function post(path, body) { const r = await fetch(BASE+path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }); if (!r.ok) throw new Error(await r.text()); return r.json(); }
async function del(path) { const r = await fetch(BASE+path, { method:'DELETE' }); if (!r.ok) throw new Error(await r.text()); return r.json(); }

export const api = {
  getHoldings:      () => get('/portfolio/holdings'),
  getSummary:       () => get('/portfolio/summary'),
  addHolding:       (h) => post('/portfolio/holdings', h),
  deleteHolding:    (id) => del(`/portfolio/holdings/${id}`),
  updateHolding:    (id, h) => {
    return fetch('/api/portfolio/holdings/'+id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(h) }).then(r=>r.json());
  },
  getMetrics:       () => get('/analytics/metrics'),
  getSectors:       () => get('/analytics/sectors'),
  getConcentration: () => get('/analytics/concentration'),
  getAllStress:      () => get('/stress/all'),
  getStressDetail:  (s) => get(`/stress/${s}`),
  getAccounts:      () => get('/accounts'),
  getBuckets:       () => get('/accounts/buckets'),
  addAccount:       (a) => post('/accounts', a),
  updateAccount:    (id, a) => {
    return fetch('/api/accounts/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(a)
    }).then(r => r.json());
  },
  deleteAccount:    (id) => del(`/accounts/${id}`),
  importExcel: (file) => {
    const fd = new FormData(); fd.append('file', file);
    return fetch(BASE+'/import/excel', { method:'POST', body:fd }).then(r=>r.json());
  },
  chatAdvisor: (message, history = []) => post('/advisor/chat', { message, history }),
  getRebalanceTargets: () => get('/rebalance/targets'),
  setRebalanceTarget:  (t) => post('/rebalance/targets', t),
  deleteRebalanceTarget: (ticker) => del(`/rebalance/targets/${ticker}`),
  getRebalancePlan:    () => get('/rebalance/plan'),
  executeRebalance:    () => post('/rebalance/execute', {}),
  getQuotes:           (tickers) => get(`/prices/quotes?tickers=${tickers.join(',')}`),
  refreshPrices:       () => post('/prices/refresh', {}),
  getIndexes:          () => get('/prices/indexes'),
  getFutures:          () => get('/prices/futures'),
  getBarra:            () => get('/risk/barra'),
  refreshBarra:        () => post('/risk/barra/refresh', {}),
  yodleeConnect:        (body) => post('/yodlee/connect', body || {}),
  yodleeGetAccounts:    (loginName) => get(`/yodlee/accounts/${loginName}`),
  yodleeGetHoldings:    (loginName) => get(`/yodlee/holdings/${loginName}`),
  yodleeImportHoldings: (loginName, clearExisting) => post(`/yodlee/import/${loginName}`, { clearExisting }),
  yodleeImportDirect:   () => post('/yodlee/import-direct', {}),
  exportCSV:           () => { window.open('/api/portfolio/export/csv', '_blank'); },
  exportExcel:         () => { window.open('/api/portfolio/export/excel', '_blank'); },
};

export const fmt = {
  dollar: (n) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n),
  pct:    (n) => (+n).toFixed(1)+'%',
  sign:   (n) => (n>=0?'+':'')+fmt.dollar(n),
};
