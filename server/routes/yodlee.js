const express = require('express');
const router  = express.Router();
const db      = require('../db');

// Yodlee API Configuration
const YODLEE_CONFIG = {
  baseUrl:        process.env.YODLEE_BASE_URL        || 'https://sandbox.api.yodlee.com/ysl',
  fastLinkUrl:    process.env.YODLEE_FASTLINK_URL    || 'https://fl4.sandbox.yodlee.com/authenticate/restserver/fastlink',
  clientId:       process.env.YODLEE_CLIENT_ID,
  clientSecret:   process.env.YODLEE_CLIENT_SECRET,
  adminLoginName: process.env.YODLEE_ADMIN_LOGIN_NAME,
  apiVersion:     process.env.YODLEE_API_VERSION     || '1.1'
};

// Helper: Get Yodlee admin access token (form-encoded, API v1.1)
async function getAdminToken() {
  const body = new URLSearchParams({
    clientId: YODLEE_CONFIG.clientId,
    secret:   YODLEE_CONFIG.clientSecret
  });
  const response = await fetch(`${YODLEE_CONFIG.baseUrl}/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Api-Version':   YODLEE_CONFIG.apiVersion,
      'loginName':     YODLEE_CONFIG.adminLoginName
    },
    body: body.toString()
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Yodlee admin auth failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  return data.token.accessToken;
}

// Helper: Get Yodlee user access token for a given loginName
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
    const text = await response.text();
    throw new Error(`Yodlee user auth failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  return data.token.accessToken;
}

// POST /api/yodlee/connect - Get FastLink 4.0 token for account linking
router.post('/connect', async (req, res) => {
  try {
    // For sandbox: use a pre-existing test user; in production, register the user
    const userLoginName = req.body.loginName || process.env.YODLEE_SANDBOX_USER || 'sbMemn1658759805566_1';

    // Get user token (for sandbox, user must already exist)
    const userToken = await getUserToken(userLoginName);

    res.json({
      success:      true,
      accessToken:  userToken,
      fastLinkUrl:  YODLEE_CONFIG.fastLinkUrl,
      loginName:    userLoginName
    });
  } catch (err) {
    res.status(500).json({ error: `Yodlee connection failed: ${err.message}` });
  }
});

// GET /api/yodlee/accounts - Get linked accounts
router.get('/accounts/:loginName', async (req, res) => {
  try {
    const userToken = await getUserToken(req.params.loginName);
    const accountsResponse = await fetch(`${YODLEE_CONFIG.baseUrl}/accounts`, {
      headers: {
        'Api-Version':   YODLEE_CONFIG.apiVersion,
        'Authorization': `Bearer ${userToken}`
      }
    });
    const accounts = await accountsResponse.json();
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/yodlee/holdings/:loginName - Get holdings from linked accounts
router.get('/holdings/:loginName', async (req, res) => {
  try {
    const userToken = await getUserToken(req.params.loginName);
    const holdingsResponse = await fetch(`${YODLEE_CONFIG.baseUrl}/holdings`, {
      headers: {
        'Api-Version':   YODLEE_CONFIG.apiVersion,
        'Authorization': `Bearer ${userToken}`
      }
    });

    const holdings = await holdingsResponse.json();

    // Transform Yodlee data to WealthOS format
    const wealthosHoldings = holdings.holding.map(h => ({
      ticker: h.symbol || h.security?.symbol || 'UNKNOWN',
      name: h.security?.name || h.description || 'Unknown Security',
      shares: parseFloat(h.quantity) || 0,
      price: parseFloat(h.price?.amount) || 0,
      value: parseFloat(h.value?.amount) || 0,
      account_name: h.account?.accountName || 'Yodlee Account',
      institution: h.account?.providerName || 'Yodlee Provider'
    }));

    res.json({
      success: true,
      holdings: wealthosHoldings,
      count: wealthosHoldings.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/yodlee/import/:loginName - Import holdings to WealthOS
router.post('/import/:loginName', async (req, res) => {
  try {
    const userToken = await getUserToken(req.params.loginName);

    // Get holdings from Yodlee
    const holdingsResponse = await fetch(`${YODLEE_CONFIG.baseUrl}/holdings`, {
      headers: {
        'Api-Version':   YODLEE_CONFIG.apiVersion,
        'Authorization': `Bearer ${userToken}`
      }
    });

    const yodleeData = await holdingsResponse.json();

    // Clear existing holdings (optional - based on user preference)
    if (req.body.clearExisting) {
      await db.query('TRUNCATE holdings RESTART IDENTITY');
    }

    let imported = 0;
    const errors = [];

    for (const h of yodleeData.holding || []) {
      try {
        const ticker = (h.symbol || h.security?.symbol || 'UNKNOWN').substring(0, 10);
        const name = (h.security?.name || h.description || 'Unknown Security').substring(0, 60);
        const shares = parseFloat(h.quantity) || 0;
        const price = parseFloat(h.price?.amount) || 0;
        const value = parseFloat(h.value?.amount) || 0;
        const accountName = (h.account?.accountName || 'Yodlee Account').substring(0, 80);

        if (value > 0) {
          await db.query(
            `INSERT INTO holdings (ticker, name, shares, price, value, account_name)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [ticker, name, shares, price, value, accountName]
          );
          imported++;
        }
      } catch (e) {
        errors.push(`${h.symbol}: ${e.message}`);
      }
    }

    // Update snapshot
    const { rows: reRows } = await db.query(
      `SELECT COALESCE(SUM(value), 0) AS total FROM holdings WHERE ticker LIKE 'RE%'`
    );
    const { rows: invRows } = await db.query(
      `SELECT COALESCE(SUM(value), 0) AS total FROM holdings WHERE ticker NOT LIKE 'RE%'`
    );
    const { rows: aRows } = await db.query(
      `SELECT COALESCE(SUM(balance), 0) AS total FROM accounts`
    );
    
    const realEstateTotal = parseFloat(reRows[0]?.total || 0);
    const investmentsTotal = parseFloat(invRows[0]?.total || 0);
    const accountsTotal = parseFloat(aRows[0]?.total || 0);
    const netWorthTotal = accountsTotal + realEstateTotal;

    await db.query(
      `INSERT INTO snapshots (snap_date, net_worth, investments, cash)
       VALUES (CURRENT_DATE, $1, $2, $3)
       ON CONFLICT (snap_date) DO UPDATE SET net_worth=$1, investments=$2, cash=$3`,
      [netWorthTotal, investmentsTotal, accountsTotal]
    );

    res.json({
      success: true,
      imported,
      errors,
      message: `Imported ${imported} holdings from Yodlee${errors.length ? ` (${errors.length} errors)` : ''}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/yodlee/import-direct - Direct import of accounts (bypass FastLink for testing/admin)
router.post('/import-direct', async (req, res) => {
  try {
    // Get sandbox test user from env
    const sandboxUser = process.env.YODLEE_SANDBOX_USER || 'sbMemn1658759805566_1';
    const userToken = await getUserToken(sandboxUser);

    // Get accounts from Yodlee
    const accountsResponse = await fetch(`${YODLEE_CONFIG.baseUrl}/accounts`, {
      headers: {
        'Api-Version':   YODLEE_CONFIG.apiVersion,
        'Authorization': `Bearer ${userToken}`
      }
    });
    const yodleeData = await accountsResponse.json();
    const yodleeAccounts = yodleeData.account || [];

    // Import to database
    let imported = 0;
    const imported_accounts = [];
    const errors = [];

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
            'Taxable'
          ]
        );

        imported++;
        imported_accounts.push({
          name: accountName,
          balance: `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          type: acc.accountType
        });
      } catch (e) {
        errors.push(`${acc.accountName}: ${e.message}`);
      }
    }

    // Update snapshot with new totals (accounts + real estate)
    try {
      const { rows: aRows } = await db.query(
        `SELECT COALESCE(SUM(balance), 0) as total FROM accounts`
      );
      const { rows: reRows } = await db.query(
        `SELECT COALESCE(SUM(value), 0) as total FROM holdings WHERE ticker LIKE 'RE%'`
      );
      const { rows: invRows } = await db.query(
        `SELECT COALESCE(SUM(value), 0) as total FROM holdings WHERE ticker NOT LIKE 'RE%'`
      );
      
      const accountsTotal = parseFloat(aRows[0]?.total || 0);
      const realEstateTotal = parseFloat(reRows[0]?.total || 0);
      const investmentsTotal = parseFloat(invRows[0]?.total || 0);
      const netWorthTotal = accountsTotal + realEstateTotal;

      await db.query(
        `INSERT INTO snapshots (snap_date, net_worth, investments, cash)
         VALUES (CURRENT_DATE, $1, $2, $3)
         ON CONFLICT (snap_date) DO UPDATE SET 
           net_worth = $1, investments = $2, cash = $3`,
        [netWorthTotal, investmentsTotal, accountsTotal]
      );
    } catch (e) {
      console.error('Snapshot update warning:', e.message);
    }

    res.json({
      success: true,
      imported,
      imported_accounts,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully imported ${imported} account(s) from Yodlee`
    });
  } catch (err) {
    res.status(500).json({
      error: `Import failed: ${err.message}`
    });
  }
});

module.exports = router;