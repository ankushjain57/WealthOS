const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function computePlan() {
  const [holdingsRes, targetsRes, totalRes] = await Promise.all([
    db.query('SELECT ticker, name, shares, price, value FROM holdings ORDER BY value DESC'),
    db.query('SELECT ticker, target_pct, asset_class FROM target_allocations'),
    db.query('SELECT SUM(value) AS total FROM holdings'),
  ]);

  const totalValue = parseFloat(totalRes.rows[0]?.total || 0);
  const holdingsMap = Object.fromEntries(
    holdingsRes.rows.map(h => [h.ticker.toUpperCase(), h])
  );
  const targetsMap = Object.fromEntries(
    targetsRes.rows.map(t => [t.ticker.toUpperCase(), t])
  );

  const trades = [];

  // For each target, compute drift vs current
  for (const [ticker, target] of Object.entries(targetsMap)) {
    const holding    = holdingsMap[ticker];
    const targetPct  = parseFloat(target.target_pct);
    const targetVal  = (targetPct / 100) * totalValue;
    const currentVal = holding ? parseFloat(holding.value) : 0;
    const currentPct = totalValue > 0 ? (currentVal / totalValue) * 100 : 0;
    const deltaValue = targetVal - currentVal;
    const price      = holding ? parseFloat(holding.price) : null;
    const deltaShares = price && price > 0 ? deltaValue / price : null;

    trades.push({
      ticker,
      name:         holding?.name || ticker,
      asset_class:  target.asset_class,
      current_value: currentVal,
      current_pct:  parseFloat(currentPct.toFixed(2)),
      target_pct:   targetPct,
      target_value: parseFloat(targetVal.toFixed(2)),
      delta_value:  parseFloat(deltaValue.toFixed(2)),
      delta_shares: deltaShares !== null ? parseFloat(deltaShares.toFixed(4)) : null,
      price:        price,
      action:       Math.abs(deltaValue) < 100 ? 'HOLD'
                  : deltaValue > 0            ? 'BUY'
                  :                             'SELL',
    });
  }

  // Sort: SELL first, then BUY, then HOLD
  trades.sort((a, b) => {
    const order = { SELL: 0, BUY: 1, HOLD: 2 };
    return (order[a.action] ?? 3) - (order[b.action] ?? 3);
  });

  const totalTargetPct = targetsRes.rows.reduce((s, t) => s + parseFloat(t.target_pct), 0);

  return { trades, totalValue, totalTargetPct: parseFloat(totalTargetPct.toFixed(2)) };
}

// ─── GET /api/rebalance/targets ───────────────────────────────────────────────
router.get('/targets', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, ticker, target_pct, asset_class, updated_at FROM target_allocations ORDER BY target_pct DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/rebalance/targets ──────────────────────────────────────────────
// Body: { ticker, target_pct, asset_class }
router.post('/targets', async (req, res) => {
  const { ticker, target_pct, asset_class = 'Equity' } = req.body;
  if (!ticker || target_pct == null)
    return res.status(400).json({ error: 'ticker and target_pct are required' });
  const pct = parseFloat(target_pct);
  if (isNaN(pct) || pct < 0 || pct > 100)
    return res.status(400).json({ error: 'target_pct must be 0–100' });
  try {
    const { rows } = await db.query(
      `INSERT INTO target_allocations (ticker, target_pct, asset_class)
       VALUES ($1, $2, $3)
       ON CONFLICT (ticker) DO UPDATE
         SET target_pct = EXCLUDED.target_pct,
             asset_class = EXCLUDED.asset_class,
             updated_at = NOW()
       RETURNING *`,
      [ticker.toUpperCase(), pct, asset_class]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/rebalance/targets/:ticker ───────────────────────────────────
router.delete('/targets/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  try {
    const { rowCount } = await db.query(
      'DELETE FROM target_allocations WHERE ticker = $1', [ticker]
    );
    if (rowCount === 0) return res.status(404).json({ error: `No target found for ${ticker}` });
    res.json({ ok: true, ticker });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/rebalance/plan ──────────────────────────────────────────────────
router.get('/plan', async (req, res) => {
  try {
    res.json(await computePlan());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/rebalance/execute ──────────────────────────────────────────────
// Applies all non-HOLD trades by updating share counts in holdings.
router.post('/execute', async (req, res) => {
  try {
    const { trades } = await computePlan();
    const applied = [];
    const skipped = [];

    for (const t of trades) {
      if (t.action === 'HOLD' || t.delta_shares === null) { skipped.push(t.ticker); continue; }

      const existing = await db.query(
        'SELECT shares, price FROM holdings WHERE UPPER(ticker) = $1', [t.ticker]
      );
      if (existing.rowCount === 0) { skipped.push(t.ticker); continue; }

      const cur       = existing.rows[0];
      const newShares = parseFloat(cur.shares) + t.delta_shares;
      if (newShares < 0) { skipped.push(t.ticker); continue; }

      const newValue = newShares * parseFloat(cur.price);
      await db.query(
        'UPDATE holdings SET shares = $1, value = $2 WHERE UPPER(ticker) = $3',
        [parseFloat(newShares.toFixed(4)), parseFloat(newValue.toFixed(2)), t.ticker]
      );
      applied.push({ ticker: t.ticker, action: t.action, delta_shares: t.delta_shares, new_shares: newShares });
    }

    res.json({ ok: true, applied, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
