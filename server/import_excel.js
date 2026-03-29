require('dotenv').config({ path: __dirname + '/.env' });
const path = require('path'), fs = require('fs'), XLSX = require('xlsx');
const { Pool } = require('pg');
const FILE = process.argv[2] || path.join(process.env.HOME, 'Downloads', 'Asset_Details_2026_March30_Updated_Empower.xlsx');
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

  // Read authoritative totals from Overview sheet
  const ov = XLSX.utils.sheet_to_json(wb.Sheets['Overview'], { header:1 });
  let cash=0, inv=0, other=0;
  for (const r of ov) {
    if (r[0]==='Cash') cash=pf(r[1]);
    if (r[0]==='Investments') inv=pf(r[1]);
    if (r[0]==='Other Assets') other=pf(r[1]);
  }
  log('Overview → Cash:'+fmt$(cash)+' Inv:'+fmt$(inv)+' Other:'+fmt$(other));

  // Deduplicate holdings — one row per ticker, highest value wins
  const EXCL = new Set(['Cash','AMERICAN GENERAL LIFE','SS S&P 500 INDEX','SS TARGET 2030']);
  const allRows = XLSX.utils.sheet_to_json(wb.Sheets['Holdings']);
  const byT = new Map();
  for (const r of allRows) {
    const t=ps(r.Ticker).substring(0,10), v=pf(r.Value);
    if (!t || v<=0) continue;
    if (EXCL.has(t) || t.startsWith('IAAAA') || t.startsWith('IAAAB') || t.startsWith('IAAAC')) continue;
    if (!byT.has(t) || v > pf(byT.get(t).Value)) byT.set(t, r);
  }
  await pool.query('TRUNCATE holdings RESTART IDENTITY');
  for (const [t,r] of byT) {
    await pool.query(
      'INSERT INTO holdings(ticker,name,shares,price,change_pct,day1_change,value) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [t, ps(r.Holding||t).substring(0,60), pf(r.Shares), pf(r.Price), pf(r.Change), pf(r['1 Day $']), pf(r.Value)]
    );
  }
  const {rows:[h]} = await pool.query('SELECT COUNT(*)c, SUM(value)t, SUM(day1_change)d FROM holdings');
  ok('Holdings: '+h.c+' positions — '+fmt$(h.t));

  // Load investment accounts from Tax_Buckets
  const accts = XLSX.utils.sheet_to_json(wb.Sheets['Tax_Buckets'], { range:3 })
    .filter(r => pf(r['Balance ($)']??r['Balance']??0) > 0 && ps(r['Included']||'Yes').toLowerCase()!=='no');
  await pool.query('TRUNCATE accounts RESTART IDENTITY');
  for (const r of accts) {
    await pool.query(
      'INSERT INTO accounts(institution,account_name,balance,tax_bucket,account_type) VALUES($1,$2,$3,$4,$5)',
      [ps(r['Institution']).substring(0,60), ps(r['Account']).substring(0,80),
       pf(r['Balance ($)']??r['Balance']), ps(r['Tax Bucket']||'Taxable'), ps(r['Account Type']||'')]
    );
  }
  const {rows:bk} = await pool.query('SELECT tax_bucket, SUM(balance)t FROM accounts GROUP BY tax_bucket ORDER BY t DESC');
  ok('Accounts: '+accts.length);
  for (const b of bk) log('  → '+b.tax_bucket+': '+fmt$(b.t));

  // Snapshot using Overview totals as source of truth
  const nw = cash + inv + other;
  await pool.query(
    'INSERT INTO snapshots(snap_date,net_worth,investments,cash) VALUES(CURRENT_DATE,$1,$2,$3) ON CONFLICT(snap_date) DO UPDATE SET net_worth=$1,investments=$2,cash=$3',
    [nw, inv, cash]
  );
  ok('Snapshot saved');

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