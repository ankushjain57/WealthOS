# Yodlee Integration Setup

## Overview
Yodlee (now part of Envestnet) provides financial data aggregation services that allow users to connect their financial accounts and automatically retrieve positions, transactions, and account information.

## Setup Requirements

### 1. Yodlee Developer Account
1. Visit [Yodlee Developer Portal](https://developer.yodlee.com)
2. Register for a developer account
3. Create a new application
4. Get your API credentials:
   - `YODLEE_API_KEY`
   - `YODLEE_API_SECRET`
   - `YODLEE_CLIENT_ID`

### 2. Environment Configuration
Add to `/server/.env`:
```env
YODLEE_BASE_URL=https://api.yodlee.com
YODLEE_API_KEY=your_api_key_here
YODLEE_API_SECRET=your_api_secret_here
YODLEE_CLIENT_ID=your_client_id_here
```

### 3. API Endpoints
The integration provides these endpoints:

- `POST /api/yodlee/connect` - Initiate account linking
- `GET /api/yodlee/accounts/:sessionId` - Get linked accounts
- `GET /api/yodlee/holdings/:sessionId` - Get holdings data
- `POST /api/yodlee/import/:sessionId` - Import holdings to WealthOS

## How It Works

1. **Connect**: User clicks "Connect Financial Accounts" → Opens Yodlee linking interface
2. **Link Accounts**: User logs into their financial institutions through Yodlee
3. **Retrieve Data**: Yodlee aggregates positions from all linked accounts
4. **Import**: Holdings are imported into WealthOS database

## Data Mapping

Yodlee provides standardized financial data that gets mapped to WealthOS format:

```javascript
// Yodlee holding → WealthOS holding
{
  symbol: "AAPL",           // → ticker
  security.name: "Apple Inc", // → name
  quantity: 100,            // → shares
  price.amount: 150.25,     // → price
  value.amount: 15025.00,   // → value
  account.accountName: "My Brokerage" // → account_name
}
```

## Security Considerations

- Yodlee handles user credentials securely
- No financial institution credentials are stored in WealthOS
- All data aggregation happens through Yodlee's secure APIs
- User consent is required for each account connection

## Limitations

- Requires Yodlee developer account and API access
- Yodlee has usage limits and costs
- Not all financial institutions are supported
- Real-time data availability depends on institution

## Alternative Solutions

If Yodlee is not feasible, consider:
- **Plaid**: Similar aggregation service
- **Manual CSV/Excel imports**: Current WealthOS method
- **Direct API integrations**: For specific institutions (Schwab, Fidelity, etc.)

## Testing

To test the integration:
1. Set up Yodlee credentials
2. Start the WealthOS server
3. Go to Import/Export tab
4. Click "Connect Financial Accounts"
5. Complete the Yodlee linking flow
6. Import holdings to WealthOS