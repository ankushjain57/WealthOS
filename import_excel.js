#!/usr/bin/env node
/**
 * WealthOS — Direct Excel Import Script
 * Loads Asset_Details_2026_March_-_Updated_from_Empower.xlsx
 * directly into the wealthos PostgreSQL database.
 *
 * Usage:
 *   node import_excel.js
 *   node import_excel.js /path/to/file.xlsx
 *
 * Run from ~/WealthOS:
 *   node import_excel.js ~/Downloads/Asset_Details_2026_March_-_Updated_from_Empower.xlsx
 */

require('dotenv').config({ path: __dirname + '/server/.env' });
const path  = require('path');
const fs    = require('fs');
const XLSX  = require('./server/node_modules/xlsx');
const { Pool } = require('./server/node_modules/pg');

// ── Config ────────────────────────────────────────────────────────────────────
const FILE = process.argv[2]
  || path.join(process.env.HOME, 'Downloads', 'Asset_Details_2026_March_-_Updated_from_Empower.xlsx');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (n) => '$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pf   = (v) => parseFloat(v) || 0;
const ps   = (v) => String(v || '').trim().substring(0, 60);

function log(msg)  { console.log('  ' + msg); }
function ok(msg)   { console.log('  \x1b[32m✓\x1b[0m ' + msg); }
function warn(msg) { console.log('  \x1b[33m⚠\x1b[0m ' + msg); }
function err(msg)  { console.log('  \x1b[31m✗\x1b[0m ' + msg); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n  WealthOS — Excel Import');
  console.log('  ' + '─'.repeat(50));

  // 1. Check file
  if (!fs.existsSync(FILE)) {
    err(`File not found: ${FILE}`);
    console.log('\n  Usage: node import_excel.js /path/to/file.xlsx\n');
    process.exit(1);
  }
  ok(`File: ${path.basename(FILE)}`);

  // 2. Check DB
  try {
    await pool.query('SELECT 1');
    ok(`Database: ${process.env.DATABASE_URL}`);
  } catch (e) {
    err('Cannot connect to database: ' + e.message);
    console.log('\n  Make sure PostgreSQL is running:');
    console.log('    brew services start postgresql@15\n');
    process.exit(1);
  }

  // 3. Read workbook
  const wb = XLSX.readFile(FILE);
  log(`Sheets found: ${wb.SheetNames.join(', ')}`);
  console.log('');

  // ── HOLDINGS ────────────────────────────────────────────────────────────────
  if (wb.SheetNames.includes('Holdings')) {
    log('Importing Holdings sheet...');
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Holdings']);
    const valid = rows.filter(r => pf(r.Value) > 0);

    await pool.query('TRUNCATE holdings RESTART IDENTITY');

    let count = 0;
    for (const r of valid) {
      const ticker = ps(r.Ticker).substring(0, 10);
      const name   = ps(r.Holding || r.Name || ticker).substring(0, 60);
      const shares = pf(r.Shares);
      const price  = pf(r.Price);
      const chg    = pf(r.Change);
      const day1   = pf(r['1 Day $']);
      const value  = pf(r.Value);

      await pool.query(
        `INSERT INTO holdings (ticker, name, shares, price, change_pct, day1_change, value)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ticker, name, shares, price, chg, day1, value]
      );
      count++;
    }
    ok(`Holdings: ${count} positions loaded`);
  } else {
    warn('Holdings sheet not found — skipping');
  }

  // ── TAX_BUCKETS / ACCOUNTS ──────────────────────────────────────────────────
  if (wb.SheetNames.includes('Tax_Buckets')) {
    log('Importing Tax_Buckets sheet...');

    // This file has a header at row 4 (0-indexed row 3), data from row 5
    const ws   = wb.Sheets['Tax_Buckets'];
    const rows = XLSX.utils.sheet_to_json(ws, { range: 3 }); // start from row 4 (0-indexed 3)

    // Column name in this file is "Balance ($)" not "Balance"
    const valid = rows.filter(r => {
      const bal = pf(r['Balance ($)'] ?? r['Balance'] ?? 0);
      const included = String(r['Included'] || 'Yes').toLowerCase();
      return bal > 0 && included !== 'no';
    });

    await pool.query('TRUNCATE accounts RESTART IDENTITY');

    let count = 0;
    for (const r of valid) {
      const institution  = ps(r['Institution']).substring(0, 60);
      const account_name = ps(r['Account']).substring(0, 80);
      const balance      = pf(r['Balance ($)'] ?? r['Balance']);
      const tax_bucket   = ps(r['Tax Bucket'] || r['TaxBucket'] || 'Taxable');
      const account_type = ps(r['Account Type'] || r['AccountType'] || '');

      await pool.query(
        `INSERT INTO accounts (institution, account_name, balance, tax_bucket, account_type)
         VALUES ($1,$2,$3,$4,$5)`,
        [institution, account_name, balance, tax_bucket, account_type]
      );
      count++;
    }
    ok(`Accounts: ${count} accounts loaded`);
  } else {
    warn('Tax_Buckets sheet not found — skipping');
  }

  // ── SNAPSHOT ─────────────────────────────────────────────────────────────────
  log('Recording portfolio snapshot...');
  const { rows: hRows } = await pool.query('SELECT SUM(value) AS total FROM holdings');
  const { rows: aRows } = await pool.query(
    `SELECT SUM(CASE WHEN tax_bucket='Taxable' THEN balance ELSE 0 END) AS cash
     FROM accounts`
  );
  const totalInv = pf(hRows[0]?.total);
  const cash     = pf(aRows[0]?.cash);

  await pool.query(
    `INSERT INTO snapshots (snap_date, net_worth, investments, cash)
     VALUES (CURRENT_DATE, $1, $2, $3)
     ON CONFLICT (snap_date) DO UPDATE
       SET net_worth=$1, investments=$2, cash=$3`,
    [totalInv + cash, totalInv, cash]
  );
  ok('Snapshot saved');

  // ── SUMMARY ───────────────────────────────────────────────────────────────────
  const { rows: summary } = await pool.query(`
    SELECT COUNT(*) AS positions, SUM(value) AS total_value,
           SUM(day1_change) AS total_day1
    FROM holdings`);
  const { rows: buckets } = await pool.query(`
    SELECT tax_bucket, SUM(balance) AS total
    FROM accounts GROUP BY tax_bucket ORDER BY total DESC`);

  console.log('');
  console.log('  ' + '─'.repeat(50));
  console.log('  \x1b[32mImport complete!\x1b[0m');
  console.log('');
  console.log(`  Portfolio value:  ${fmt$(summary[0].total_value)}`);
  console.log(`  Positions:        ${summary[0].positions}`);
  console.log(`  Today's P&L:      ${fmt$(summary[0].total_day1)}`);
  console.log('');
  console.log('  Tax buckets:');
  for (const b of buckets) {
    console.log(`    ${(b.tax_bucket + ':').padEnd(32)} ${fmt$(b.total)}`);
  }
  console.log('');
  console.log('  Open your app → http://localhost:3000');
  console.log('');

  await pool.end();
}

main().catch(e => {
  err('Unexpected error: ' + e.message);
  console.error(e);
  process.exit(1);
});
