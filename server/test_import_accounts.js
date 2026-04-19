/**
 * Direct Account Import Test (bypass FastLink)
 * Tests importing accounts directly from Yodlee without FastLink UI
 * Run with: node test_import_accounts.js
 */

require('dotenv').config();
const db = require('./db');

const YODLEE_CONFIG = {
  baseUrl:        process.env.YODLEE_BASE_URL,
  clientId:       process.env.YODLEE_CLIENT_ID,
  clientSecret:   process.env.YODLEE_CLIENT_SECRET,
  sandboxUser:    process.env.YODLEE_SANDBOX_USER,
  apiVersion:     process.env.YODLEE_API_VERSION || '1.1'
};

async function getUserToken(userLoginName) {
  const body = new URLSearchParams({
    clientId: YODLEE_CONFIG.clientId,
    secret:   YODLEE_CONFIG.clientSecret
  });
  
  const response = await fetch(`${YODLEE_CONFIG.baseUrl}/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Api-Version':   YODLEE_CONFIG.apiVersion,
      'loginName':     userLoginName
    },
    body: body.toString()
  });
  
  if (!response.ok) {
    throw new Error(`Auth failed (${response.status})`);
  }
  
  const data = await response.json();
  return data.token?.accessToken;
}

async function getAccounts(userToken) {
  const response = await fetch(`${YODLEE_CONFIG.baseUrl}/accounts`, {
    method: 'GET',
    headers: {
      'Api-Version':   YODLEE_CONFIG.apiVersion,
      'Authorization': `Bearer ${userToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Get accounts failed (${response.status})`);
  }
  
  const data = await response.json();
  return data.account || [];
}

async function importAccounts() {
  console.log('📥 Importing Yodlee Sandbox Accounts\n');
  
  try {
    // Get token
    console.log('Getting auth token...');
    const token = await getUserToken(YODLEE_CONFIG.sandboxUser);
    console.log('✓ Authenticated\n');
    
    // Get accounts from Yodlee
    console.log('Fetching accounts from Yodlee...');
    const yodleeAccounts = await getAccounts(token);
    console.log(`✓ Found ${yodleeAccounts.length} accounts\n`);
    
    // Insert into WealthOS database
    console.log('Importing to WealthOS database...');
    let imported = 0;
    
    for (const acc of yodleeAccounts) {
      try {
        const accountName = `${acc.providerName} - ${acc.accountName}`;
        const balance = parseFloat(acc.balance?.amount || 0);
        
        await db.query(
          `INSERT INTO accounts (
            institution, 
            account_name, 
            account_type, 
            balance, 
            tax_bucket
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            acc.providerName,
            accountName,
            acc.accountType || 'Checking',
            balance,
            'Taxable'  // Default tax bucket for bank accounts
          ]
        );
        
        console.log(`  ✓ ${accountName}: $${balance.toLocaleString()}`);
        imported++;
      } catch (e) {
        console.log(`  ✗ ${acc.accountName}: ${e.message}`);
      }
    }
    
    console.log(`\n✅ Imported ${imported} accounts\n`);
    
    // Show what's now in the database
    const result = await db.query(
      `SELECT COUNT(*) as count, SUM(balance) as total FROM accounts`
    );
    
    console.log('Database Summary:');
    console.log(`  Total accounts: ${result.rows[0].count}`);
    console.log(`  Total balance: $${parseFloat(result.rows[0].total || 0).toLocaleString()}`);
    
    await db.end();
    
  } catch (err) {
    console.error('❌ Import failed:', err.message);
    process.exit(1);
  }
}

importAccounts();
