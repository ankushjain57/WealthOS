require('dotenv').config({ path: __dirname + '/.env' });
const path = require('path'), fs = require('fs'), XLSX = require('xlsx');
const { Pool } = require('pg');
const FILE = process.argv[2] || path.join(__dirname, '..', 'Holdings_MS_April172026.xlsx');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const fmt$ = n => '$'+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const pf=v=>parseFloat(v)||0, ps=v=>String(v||'').trim();
const ok=m=>console.log('  \x1b[32m✓\x1b[0m '+m);
const err=m=>console.log('  \x1b[31m✗\x1b[0m '+m);
const log=m=>console.log('  '+m);

async function main() {
  console.log('\n  WealthOS Import\n  '+'─'.repeat(40));
  if (!fs.existsSync(FILE)) { err('File not found: '+FILE); process.exit(1); }
  ok('File: '+path.basename(FILE));
  try { await pool.query('SELECT 1'); ok('DB: '+process.env.DATABASE_URL); }
  catch(e) { err('DB: '+e.message); process.exit(1); }

  const wb = XLSX.readFile(FILE);
  console.log('');

  // Skip Overview reading - only importing Morgan Stanley holdings
  log('Skipping overview import (only Morgan Stanley holdings)');

  // Get existing Morgan Stanley account names
  const { rows: msAccounts } = await pool.query(
    "SELECT DISTINCT account_name FROM accounts WHERE LOWER(institution) LIKE '%morgan stanley%'"
  );
  const msAccountNames = new Set(msAccounts.map(a => a.account_name));
  log('Found ' + msAccountNames.size + ' Morgan Stanley accounts');

  // Deduplicate holdings — one row per ticker+account, highest value wins
  const EXCL = new Set(['Cash','AMERICAN GENERAL LIFE','SS S&P 500 INDEX','SS TARGET 2030']);
  const allRows = XLSX.utils.sheet_to_json(wb.Sheets['Holdings']);
  const byT = new Map();
  for (const r of allRows) {
    const t=ps(r.Ticker).substring(0,10), v=pf(r.Value), acct=ps(r.Account||r['Account Name']||'');
    if (!t || v<=0) continue;
    if (EXCL.has(t) || t.startsWith('IAAAA') || t.startsWith('IAAAB') || t.startsWith('IAAAC')) continue;
    // Only include if account matches Morgan Stanley accounts
    if (!msAccountNames.has(acct)) continue;
    const key = t + '|' + acct;
    if (!byT.has(key) || v > pf(byT.get(key).Value)) byT.set(key, r);
  }
  log('Processing ' + byT.size + ' Morgan Stanley holdings');

  // Delete existing holdings for Morgan Stanley accounts to avoid double counting
  for (const acct of msAccountNames) {
    await pool.query('DELETE FROM holdings WHERE account_name = $1', [acct]);
  }
  log('Cleared existing Morgan Stanley holdings');

  // Insert new holdings
  for (const [key,r] of byT) {
    const acct = ps(r.Account||r['Account Name']||'');
    await pool.query(
      'INSERT INTO holdings(ticker,name,account_name,shares,price,change_pct,day1_change,value) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [ps(r.Ticker).substring(0,10), ps(r.Holding||r.Name||r.Ticker).substring(0,60), acct, 
       pf(r.Shares), pf(r.Price), pf(r.Change||r['Change %']||0), pf(r['1 Day $']||r['Day Change']||0), pf(r.Value)]
    );
  }
  const {rows:[h]} = await pool.query("SELECT COUNT(*)c, SUM(value)t FROM holdings WHERE account_name IN (SELECT account_name FROM accounts WHERE LOWER(institution) LIKE '%morgan stanley%')");
  ok('Morgan Stanley Holdings: '+h.c+' positions — '+fmt$(h.t));

  // Skip accounts import - only loading holdings for existing Morgan Stanley accounts
  log('Skipping accounts import (using existing Morgan Stanley accounts)');

  // Skip snapshot update - only updated Morgan Stanley holdings
  log('Skipping snapshot update (only Morgan Stanley holdings updated)');

  console.log('\n  '+'─'.repeat(40));
  console.log('  \x1b[32mDone!\x1b[0m');
  console.log('  Investments:  '+fmt$(inv));
  console.log('  Cash:         '+fmt$(cash));
  console.log('  Other assets: '+fmt$(other)+'  (real estate)');
  console.log('  Net worth:    '+fmt$(nw));
  console.log('  Today P&L:    '+fmt$(h.d)+'\n');
  await pool.end();
}
main().catch(e => { err(e.message); process.exit(1); });