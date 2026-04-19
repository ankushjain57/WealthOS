require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CSV_FILE = process.argv[2] || path.join(__dirname, '..', 'Holdings_MS_April172026.csv');

async function importMSHoldingsFromCSV() {
  console.log('Importing Morgan Stanley holdings from CSV...');

  if (!fs.existsSync(CSV_FILE)) {
    console.log('CSV file not found:', CSV_FILE);
    console.log('Please create a CSV file with columns: account_name,ticker,name,shares,price,value');
    console.log('Example:');
    console.log('account_name,ticker,name,shares,price,value');
    console.log('"Select UMA - 9851","AAPL","Apple Inc",100.5,175.25,17590.00');
    process.exit(1);
  }

  // Get Morgan Stanley accounts
  const { rows: msAccounts } = await pool.query(
    "SELECT DISTINCT account_name FROM accounts WHERE LOWER(institution) LIKE '%morgan stanley%'"
  );
  const msAccountNames = new Set(msAccounts.map(a => a.account_name));
  console.log('Found', msAccountNames.size, 'Morgan Stanley accounts');

  // Read CSV
  const csvData = fs.readFileSync(CSV_FILE, 'utf8');
  const lines = csvData.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

  console.log('CSV headers:', headers);

  const expectedHeaders = ['account_name', 'ticker', 'name', 'shares', 'price', 'value'];
  const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
  if (missingHeaders.length > 0) {
    console.log('Missing required headers:', missingHeaders);
    process.exit(1);
  }

  // Parse holdings
  const holdings = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
    if (values.length >= 6) {
      holdings.push({
        account_name: values[0],
        ticker: values[1],
        name: values[2],
        shares: parseFloat(values[3]) || 0,
        price: parseFloat(values[4]) || 0,
        value: parseFloat(values[5]) || 0
      });
    }
  }

  console.log('Parsed', holdings.length, 'holdings from CSV');

  // Filter for Morgan Stanley accounts only
  const msHoldings = holdings.filter(h => msAccountNames.has(h.account_name));
  console.log('Filtered to', msHoldings.length, 'Morgan Stanley holdings');

  // Clear existing holdings for MS accounts
  for (const acct of msAccountNames) {
    await pool.query('DELETE FROM holdings WHERE account_name = $1', [acct]);
  }
  console.log('Cleared existing Morgan Stanley holdings');

  // Insert new holdings
  let imported = 0;
  for (const h of msHoldings) {
    await pool.query(
      'INSERT INTO holdings(ticker, name, account_name, shares, price, change_pct, day1_change, value) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [h.ticker, h.name, h.account_name, h.shares, h.price, 0, 0, h.value]
    );
    imported++;
  }

  console.log('Imported', imported, 'holdings');

  // Update summary
  const { rows: [summary] } = await pool.query(
    "SELECT COUNT(*) as count, SUM(value) as total FROM holdings WHERE account_name IN (SELECT account_name FROM accounts WHERE LOWER(institution) LIKE '%morgan stanley%')"
  );
  console.log('Morgan Stanley holdings:', summary.count, 'positions,', '$' + Number(summary.total).toLocaleString());
}

importMSHoldingsFromCSV().then(() => {
  console.log('Done!');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});