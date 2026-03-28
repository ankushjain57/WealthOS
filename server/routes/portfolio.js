const express = require('express');
const router  = express.Router();
const db      = require('../db');

router.get('/holdings', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM holdings ORDER BY value DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/summary', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT SUM(value) AS total_value, SUM(day1_change) AS total_day1,
             COUNT(*) AS position_count, MAX(imported_at) AS last_import
      FROM holdings`);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/holdings', async (req, res) => {
  const { ticker, name, shares, price } = req.body;
  if (!ticker || !shares || !price)
    return res.status(400).json({ error: 'ticker, shares, price required' });
  const value = parseFloat(shares) * parseFloat(price);
  try {
    const { rows } = await db.query(
      `INSERT INTO holdings (ticker, name, shares, price, change_pct, day1_change, value)
       VALUES ($1,$2,$3,$4,0,0,$5) RETURNING *`,
      [ticker.toUpperCase(), name || ticker, shares, price, value]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/holdings/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM holdings WHERE id=$1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
