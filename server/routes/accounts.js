const express = require('express');
const router  = express.Router();
const db      = require('../db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM accounts ORDER BY balance DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/buckets', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT tax_bucket, SUM(balance) AS total FROM accounts GROUP BY tax_bucket ORDER BY total DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const { institution, account_name, balance, tax_bucket, account_type } = req.body;
  if (!institution || !balance) return res.status(400).json({ error: 'institution and balance required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO accounts (institution, account_name, balance, tax_bucket, account_type)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [institution, account_name||'', parseFloat(balance), tax_bucket||'Taxable', account_type||'']);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM accounts WHERE id=$1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
