/**
 * Test Yodlee Sandbox Connectivity
 * Run with: node test_yodlee.js
 */

require('dotenv').config();

const YODLEE_CONFIG = {
  baseUrl:        process.env.YODLEE_BASE_URL        || 'https://sandbox.api.yodlee.com/ysl',
  fastLinkUrl:    process.env.YODLEE_FASTLINK_URL    || 'https://fl4.sandbox.yodlee.com/authenticate/restserver/fastlink',
  clientId:       process.env.YODLEE_CLIENT_ID,
  clientSecret:   process.env.YODLEE_CLIENT_SECRET,
  adminLoginName: process.env.YODLEE_ADMIN_LOGIN_NAME,
  sandboxUser:    process.env.YODLEE_SANDBOX_USER,
  apiVersion:     process.env.YODLEE_API_VERSION     || '1.1'
};

console.log('🧪 Yodlee Sandbox Connectivity Test\n');
console.log('Configuration:');
console.log(`  Base URL:      ${YODLEE_CONFIG.baseUrl}`);
console.log(`  FastLink URL:  ${YODLEE_CONFIG.fastLinkUrl}`);
console.log(`  Client ID:     ${YODLEE_CONFIG.clientId ? '✓ Set' : '✗ MISSING'}`);
console.log(`  Client Secret: ${YODLEE_CONFIG.clientSecret ? '✓ Set' : '✗ MISSING'}`);
console.log(`  Admin User:    ${YODLEE_CONFIG.adminLoginName || '✗ MISSING'}`);
console.log(`  Sandbox User:  ${YODLEE_CONFIG.sandboxUser || '✗ MISSING'}`);
console.log(`  API Version:   ${YODLEE_CONFIG.apiVersion}\n`);

async function getAdminToken() {
  console.log('1️⃣  Getting Admin Token...');
  const body = new URLSearchParams({
    clientId: YODLEE_CONFIG.clientId,
    secret:   YODLEE_CONFIG.clientSecret
  });
  
  try {
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
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    
    const data = await response.json();
    const token = data.token?.accessToken;
    
    if (!token) {
      throw new Error('No accessToken in response: ' + JSON.stringify(data));
    }
    
    console.log('   ✓ Admin token obtained\n');
    return token;
  } catch (err) {
    console.error(`   ✗ Failed: ${err.message}\n`);
    throw err;
  }
}

async function getUserToken(userLoginName) {
  console.log(`2️⃣  Getting User Token for "${userLoginName}"...`);
  const body = new URLSearchParams({
    clientId: YODLEE_CONFIG.clientId,
    secret:   YODLEE_CONFIG.clientSecret
  });
  
  try {
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
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    
    const data = await response.json();
    const token = data.token?.accessToken;
    
    if (!token) {
      throw new Error('No accessToken in response: ' + JSON.stringify(data));
    }
    
    console.log(`   ✓ User token obtained\n`);
    return token;
  } catch (err) {
    console.error(`   ✗ Failed: ${err.message}\n`);
    throw err;
  }
}

async function getAccounts(userToken) {
  console.log('3️⃣  Fetching Accounts...');
  
  try {
    const response = await fetch(`${YODLEE_CONFIG.baseUrl}/accounts`, {
      method: 'GET',
      headers: {
        'Api-Version':   YODLEE_CONFIG.apiVersion,
        'Authorization': `Bearer ${userToken}`
      }
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    
    const data = await response.json();
    const accounts = data.account || [];
    
    console.log(`   ✓ Found ${accounts.length} account(s)\n`);
    
    if (accounts.length > 0) {
      console.log('   Accounts:');
      accounts.forEach((acc, i) => {
        console.log(`     ${i + 1}. ${acc.providerName} - ${acc.accountName} (${acc.accountType})`);
        console.log(`        ID: ${acc.id}, Balance: ${acc.balance?.amount || 'N/A'}`);
      });
      console.log();
    }
    
    return accounts;
  } catch (err) {
    console.error(`   ✗ Failed: ${err.message}\n`);
    throw err;
  }
}

async function getHoldings(userToken) {
  console.log('4️⃣  Fetching Holdings...');
  
  try {
    const response = await fetch(`${YODLEE_CONFIG.baseUrl}/holdings`, {
      method: 'GET',
      headers: {
        'Api-Version':   YODLEE_CONFIG.apiVersion,
        'Authorization': `Bearer ${userToken}`
      }
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    
    const data = await response.json();
    const holdings = data.holding || [];
    
    console.log(`   ✓ Found ${holdings.length} holding(s)\n`);
    
    if (holdings.length > 0) {
      console.log('   Holdings (first 5):');
      holdings.slice(0, 5).forEach((h, i) => {
        console.log(`     ${i + 1}. ${h.symbol || 'N/A'} - ${h.security?.name || h.description || 'Unknown'}`);
        console.log(`        Qty: ${h.quantity}, Value: ${h.value?.amount || 'N/A'}`);
      });
      if (holdings.length > 5) {
        console.log(`     ... and ${holdings.length - 5} more\n`);
      } else {
        console.log();
      }
    }
    
    return holdings;
  } catch (err) {
    console.error(`   ✗ Failed: ${err.message}\n`);
    throw err;
  }
}

async function runTests() {
  try {
    // Test 1: Admin token
    await getAdminToken();
    
    // Test 2-4: User token, accounts, holdings
    const userToken = await getUserToken(YODLEE_CONFIG.sandboxUser);
    const accounts = await getAccounts(userToken);
    const holdings = await getHoldings(userToken);
    
    // Summary
    console.log('✅ All tests passed!\n');
    console.log('Summary:');
    console.log(`  • Accounts available: ${accounts.length}`);
    console.log(`  • Holdings available: ${holdings.length}`);
    console.log(`\nYodlee sandbox is connected and working.`);
    
  } catch (err) {
    console.error('\n❌ Test suite failed');
    process.exit(1);
  }
}

runTests();
