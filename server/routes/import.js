const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const db      = require('../db');
const upload  = multer({ storage: multer.memoryStorage() });

router.post('/excel', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    let holdingsLoaded = 0, accountsLoaded = 0;

    if (wb.SheetNames.includes('Holdings')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Holdings']);
      const h = raw.filter(r=>(r.Value||0)>0).map(r=>[
        String(r.Ticker||'').substring(0,10), String(r.Holding||'').substring(0,60),
        parseFloat(r.Shares||0), parseFloat(r.Price||0),
        parseFloat(r.Change||0), parseFloat(r['1 Day $']||0), parseFloat(r.Value||0)
      ]);
      await db.query('TRUNCATE holdings RESTART IDENTITY');
      for (const row of h) {
        await db.query(
          `INSERT INTO holdings (ticker,name,shares,price,change_pct,day1_change,value) VALUES ($1,$2,$3,$4,$5,$6,$7)`, row);
      }
      holdingsLoaded = h.length;
    }

    if (wb.SheetNames.includes('Tax_Buckets')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Tax_Buckets'], { header:1 });
      const a = raw.slice(3).map(r=>([
        String(r[0]||'').substring(0,40), String(r[1]||'').substring(0,60),
        parseFloat(r[2]||0), String(r[3]||'Taxable'), String(r[4]||'')
      ])).filter(r=>r[2]>0);
      await db.query('TRUNCATE accounts RESTART IDENTITY');
      for (const row of a) {
        await db.query(
          `INSERT INTO accounts (institution,account_name,balance,tax_bucket,account_type) VALUES ($1,$2,$3,$4,$5)`, row);
      }
      accountsLoaded = a.length;
    }

    res.json({ success:true, holdingsLoaded, accountsLoaded, message:`Loaded ${holdingsLoaded} holdings and ${accountsLoaded} accounts` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
