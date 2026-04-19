require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Sample holdings data - replace with actual data from Excel
const MS_HOLDINGS = [
  // Add your holdings here in this format:
  // { account_name: "Select UMA - 9851", ticker: "AAPL", name: "Apple Inc", shares: 100, price: 150.00, value: 15000.00 }
];

async function importMSHoldings() {
  console.log('Importing Morgan Stanley holdings...');

  // Get Morgan Stanley accounts
  const { rows: msAccounts } = await pool.query(
    "SELECT DISTINCT account_name FROM accounts WHERE LOWER(institution) LIKE '%morgan stanley%'"
  );
  const msAccountNames = new Set(msAccounts.map(a => a.account_name));
  console.log('Found', msAccountNames.size, 'Morgan Stanley accounts');

  // Clear existing holdings for MS accounts
  for (const acct of msAccountNames) {
    await pool.query('DELETE FROM holdings WHERE account_name = $1', [acct]);
  }
  console.log('Cleared existing holdings');

  // Insert new holdings
  let imported = 0;
  for (const h of MS_HOLDINGS) {
    if (msAccountNames.has(h.account_name)) {
      await pool.query(
        'INSERT INTO holdings(ticker, name, account_name, shares, price, change_pct, day1_change, value) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [h.ticker, h.name, h.account_name, h.shares, h.price, h.change_pct || 0, h.day1_change || 0, h.value]
      );
      imported++;
    }
  }

  console.log('Imported', imported, 'holdings');

  // Update summary
  const { rows: [summary] } = await pool.query(
    "SELECT COUNT(*) as count, SUM(value) as total FROM holdings WHERE account_name IN (SELECT account_name FROM accounts WHERE LOWER(institution) LIKE '%morgan stanley%')"
  );
  console.log('Morgan Stanley holdings:', summary.count, 'positions,', '$' + Number(summary.total).toLocaleString());
}

if (MS_HOLDINGS.length === 0) {
  console.log('Please edit MS_HOLDINGS array with your holdings data from the Excel file');
  console.log('Format: { account_name: "Account Name", ticker: "TICKER", name: "Company Name", shares: 100.0, price: 150.00, value: 15000.00 }');
  process.exit(1);
}

importMSHoldings().then(() => {
  console.log('Done!');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});