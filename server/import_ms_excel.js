#!/usr/bin/env node
/**
 * WealthOS — Morgan Stanley Excel Holdings Import Script
 * Loads holdings from Morgan Stanley Excel file into the wealthos PostgreSQL database.
 * Clears existing Morgan Stanley holdings first to prevent double counting.
 *
 * Expected Excel format:
 * Columns: account_name, ticker, name, shares, price, value
 *
 * Usage:
 *   node import_ms_excel.js /path/to/Holdings_MS_April172026.xlsx
 *
 * Run from ~/WealthOS/server:
 *   node import_ms_excel.js ~/Downloads/Holdings_MS_April172026.xlsx
 */

require('dotenv').config({ path: __dirname + '/.env' });
const path  = require('path');
const fs    = require('fs');
const XLSX  = require('xlsx');
const { Pool } = require('pg');

// ── Config ────────────────────────────────────────────────────────────────────
const FILE = process.argv[2];
if (!FILE) {
  console.log('\n  Usage: node import_ms_excel.js /path/to/file.xlsx\n');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (n) => '$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pf   = (v) => parseFloat(v) || 0;
const ps   = (v) => String(v || '').trim();

function log(msg)  { console.log('  ' + msg); }
function ok(msg)   { console.log('  \x1b[32m✓\x1b[0m ' + msg); }
function warn(msg) { console.log('  \x1b[33m⚠\x1b[0m ' + msg); }
function err(msg)  { console.log('  \x1b[31m✗\x1b[0m ' + msg); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n  WealthOS — Morgan Stanley Excel Import');
  console.log('  ' + '─'.repeat(50));

  // 1. Check file
  if (!fs.existsSync(FILE)) {
    err(`File not found: ${FILE}`);
    console.log('\n  Usage: node import_ms_excel.js /path/to/file.xlsx\n');
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

  // Assume first sheet contains the holdings data
  const sheetName = wb.SheetNames[0];
  log(`Using sheet: ${sheetName}`);

  const allRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
  log(`Total rows: ${allRows.length}`);

  // 4. Filter Morgan Stanley holdings - look for rows with Morgan Stanley institution
  const msHoldings = allRows.filter(r => {
    // Check various possible column names for institution
    const institution = ps(r['__EMPTY_1'] || r['Institution'] || '');
    return institution.toLowerCase().includes('morgan stanley');
  });

  ok(`Morgan Stanley holdings found: ${msHoldings.length}`);

  if (msHoldings.length === 0) {
    warn('No valid Morgan Stanley holdings found in the file');
    console.log('Sample rows:');
    allRows.slice(0, 5).forEach((r, i) => console.log(`  ${i}: ${JSON.stringify(r)}`));
    process.exit(0);
  }

  // 5. Clear existing Morgan Stanley holdings
  log('Clearing existing Morgan Stanley holdings...');
  await pool.query(`
    DELETE FROM holdings
    WHERE LOWER(account_name) LIKE '%morgan stanley%'
       OR LOWER(account_name) LIKE '%select uma%'
       OR LOWER(account_name) LIKE '%aaa%'
       OR LOWER(account_name) LIKE '%platinum%'
  `);
  ok('Existing Morgan Stanley holdings cleared');

  // 6. Import new holdings
  log('Importing new holdings...');
  let count = 0;
  for (const r of msHoldings) {
    const accountName = ps(r['All Holdings Ungrouped By Security']); // Account
    const ticker = ps(r['__EMPTY_4']).substring(0, 10); // Symbol
    const name = ps(r['__EMPTY']).substring(0, 60); // Name
    const shares = pf(r['__EMPTY_8']); // Quantity
    const price = pf(r['__EMPTY_6']); // Last ($)
    const value = pf(r['__EMPTY_9']); // Market Value ($)

    try {
      await pool.query(
        `INSERT INTO holdings (account_name, ticker, name, shares, price, value)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [accountName, ticker, name, shares, price, value]
      );
      count++;
    } catch (e) {
      warn(`Failed to import ${ticker}: ${e.message}`);
    }
  }
  ok(`Holdings imported: ${count}`);

  // 7. Update snapshot
  log('Updating portfolio snapshot...');
  const { rows: hRows } = await pool.query('SELECT SUM(value) AS total FROM holdings');
  const { rows: aRows } = await pool.query(
    `SELECT SUM(balance) AS cash FROM accounts
     WHERE tax_bucket <> 'Tax-Free / Tax-Advantaged'
       AND (
         LOWER(account_type) LIKE '%cash%'
         OR LOWER(account_type) LIKE '%cd%'
         OR LOWER(institution) LIKE '%goldman sachs%'
         OR LOWER(institution) LIKE '%marcus%'
         OR LOWER(institution) LIKE '%affinity%'
         OR LOWER(institution) LIKE '%wells fargo%'
         OR LOWER(institution) LIKE '%treasury%'
       )`
  );
  const totalInv = pf(hRows[0]?.total);
  const cash = pf(aRows[0]?.cash);

  await pool.query(
    `INSERT INTO snapshots (snap_date, net_worth, investments, cash)
     VALUES (CURRENT_DATE, $1, $2, $3)
     ON CONFLICT (snap_date) DO UPDATE
       SET net_worth=$1, investments=$2, cash=$3`,
    [totalInv + cash, totalInv, cash]
  );
  ok('Snapshot updated');

  console.log('\n  Import complete!\n');
  await pool.end();
}

main().catch(e => {
  err('Import failed: ' + e.message);
  console.error(e);
  process.exit(1);
});