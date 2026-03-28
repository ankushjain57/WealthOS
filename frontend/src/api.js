const BASE = '/api';
async function get(path) { const r = await fetch(BASE+path); if (!r.ok) throw new Error(await r.text()); return r.json(); }
async function post(path, body) { const r = await fetch(BASE+path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }); if (!r.ok) throw new Error(await r.text()); return r.json(); }
async function del(path) { const r = await fetch(BASE+path, { method:'DELETE' }); if (!r.ok) throw new Error(await r.text()); return r.json(); }

export const api = {
  getHoldings:      () => get('/portfolio/holdings'),
  getSummary:       () => get('/portfolio/summary'),
  addHolding:       (h) => post('/portfolio/holdings', h),
  deleteHolding:    (id) => del(`/portfolio/holdings/${id}`),
  getMetrics:       () => get('/analytics/metrics'),
  getSectors:       () => get('/analytics/sectors'),
  getConcentration: () => get('/analytics/concentration'),
  getAllStress:      () => get('/stress/all'),
  getStressDetail:  (s) => get(`/stress/${s}`),
  getAccounts:      () => get('/accounts'),
  getBuckets:       () => get('/accounts/buckets'),
  addAccount:       (a) => post('/accounts', a),
  deleteAccount:    (id) => del(`/accounts/${id}`),
  importExcel: (file) => {
    const fd = new FormData(); fd.append('file', file);
    return fetch(BASE+'/import/excel', { method:'POST', body:fd }).then(r=>r.json());
  }
};

export const fmt = {
  dollar: (n) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n),
  pct:    (n) => (+n).toFixed(1)+'%',
  sign:   (n) => (n>=0?'+':'')+fmt.dollar(n),
};
