const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/portfolio/holdings
router.get('/holdings', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM holdings ORDER BY value DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/portfolio/summary
router.get('/summary', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        SUM(value)        AS total_value,
        SUM(day1_change)  AS total_day1,
        COUNT(*)          AS position_count,
        MAX(imported_at)  AS last_import
      FROM holdings
    `);

    // Pull latest snapshot for authoritative net worth, investments, cash
    const snap = await db.query(
      `SELECT net_worth, investments, cash
       FROM snapshots ORDER BY snap_date DESC LIMIT 1`
    );

    res.json({
      ...rows[0],
      net_worth:   snap.rows[0]?.net_worth   || rows[0].total_value,
      investments: snap.rows[0]?.investments || rows[0].total_value,
      cash:        snap.rows[0]?.cash        || 0
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/portfolio/holdings  (manual add)
router.post('/holdings', async (req, res) => {
  const { ticker, name, account_name, account_type, product_type, shares, price } = req.body;
  if (!ticker || !shares || !price)
    return res.status(400).json({ error: 'ticker, shares, price required' });
  const value = parseFloat(shares) * parseFloat(price);
  try {
    const { rows } = await db.query(
      `INSERT INTO holdings (ticker, name, account_name, account_type, product_type, shares, price, change_pct, day1_change, value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,$8) RETURNING *`,
      [ticker.toUpperCase(), name || ticker, account_name || '', account_type || '', product_type || '', shares, price, value]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/portfolio/holdings/:id  (edit)
router.put('/holdings/:id', async (req, res) => {
  const { ticker, name, account_name, account_type, product_type, shares, price } = req.body;
  if (!ticker || !shares || !price)
    return res.status(400).json({ error: 'ticker, shares, price required' });
  const value = parseFloat(shares) * parseFloat(price);
  try {
    const { rows } = await db.query(
      `UPDATE holdings SET ticker=$1, name=$2, account_name=$3, account_type=$4, product_type=$5, shares=$6, price=$7, value=$8
       WHERE id=$9 RETURNING *`,
      [ticker.toUpperCase(), name || ticker, account_name || '', account_type || '', product_type || '', parseFloat(shares), parseFloat(price), value, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/portfolio/holdings/:id
router.delete('/holdings/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM holdings WHERE id=$1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/portfolio/export/csv - Export holdings as CSV
router.get('/export/csv', async (req, res) => {
  try {
    const { rows: holdings } = await db.query(`
      SELECT
        ticker,
        name,
        account_name,
        shares,
        price,
        change_pct,
        day1_change,
        value,
        imported_at
      FROM holdings
      ORDER BY account_name, value DESC
    `);

    const { rows: accounts } = await db.query(`
      SELECT
        institution,
        account_name,
        balance,
        tax_bucket,
        account_type,
        created_at
      FROM accounts
      ORDER BY institution, account_name
    `);

    // Create CSV content
    let csv = 'HOLDINGS\n';
    csv += 'Ticker,Name,Account Name,Shares,Price,Change %,Day Change,Value,Imported At\n';

    holdings.forEach(h => {
      csv += `"${h.ticker}","${h.name}","${h.account_name}",${h.shares},${h.price},${h.change_pct || 0},${h.day1_change || 0},${h.value},"${h.imported_at}"\n`;
    });

    csv += '\nACCOUNTS\n';
    csv += 'Institution,Account Name,Balance,Tax Bucket,Account Type,Created At\n';

    accounts.forEach(a => {
      csv += `"${a.institution}","${a.account_name}",${a.balance},"${a.tax_bucket}","${a.account_type}","${a.created_at}"\n`;
    });

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="wealthos_portfolio_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolio/export/excel - Export holdings as Excel
router.get('/export/excel', async (req, res) => {
  try {
    const XLSX = require('../node_modules/xlsx');
    const { rows: holdings } = await db.query(`
      SELECT
        ticker,
        name,
        account_name,
        shares,
        price,
        change_pct,
        day1_change,
        value,
        imported_at
      FROM holdings
      ORDER BY account_name, value DESC
    `);

    const { rows: accounts } = await db.query(`
      SELECT
        institution,
        account_name,
        balance,
        tax_bucket,
        account_type,
        created_at
      FROM accounts
      ORDER BY institution, account_name
    `);

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Holdings sheet
    const holdingsData = holdings.map(h => ({
      'Ticker': h.ticker,
      'Name': h.name,
      'Account Name': h.account_name,
      'Shares': h.shares,
      'Price': h.price,
      'Change %': h.change_pct || 0,
      'Day Change': h.day1_change || 0,
      'Value': h.value,
      'Imported At': h.imported_at
    }));

    const holdingsSheet = XLSX.utils.json_to_sheet(holdingsData);
    XLSX.utils.book_append_sheet(wb, holdingsSheet, 'Holdings');

    // Accounts sheet
    const accountsData = accounts.map(a => ({
      'Institution': a.institution,
      'Account Name': a.account_name,
      'Balance': a.balance,
      'Tax Bucket': a.tax_bucket,
      'Account Type': a.account_type,
      'Created At': a.created_at
    }));

    const accountsSheet = XLSX.utils.json_to_sheet(accountsData);
    XLSX.utils.book_append_sheet(wb, accountsSheet, 'Accounts');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for Excel download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="wealthos_portfolio_${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
