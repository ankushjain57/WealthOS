# Export Portfolio Data

WealthOS now supports exporting your complete portfolio data in both CSV and Excel formats.

## Export Options

### From Dashboard
- Click the 📊 button for CSV export
- Click the 📈 button for Excel export
- Files are automatically downloaded with timestamp

### From Import/Export Tab
- Dedicated "Export Portfolio Data" section
- Download CSV or Excel formats
- Includes comprehensive portfolio information

## Exported Data

### Holdings Sheet/Section
- **Ticker**: Stock symbol
- **Name**: Security name
- **Account Name**: Which account holds the position
- **Shares**: Number of shares owned
- **Price**: Current price per share
- **Change %**: Daily price change percentage
- **Day Change**: Dollar change for the position
- **Value**: Total position value
- **Imported At**: When the data was last imported

### Accounts Sheet/Section
- **Institution**: Bank/brokerage name
- **Account Name**: Account identifier
- **Balance**: Account balance
- **Tax Bucket**: Tax-advantaged status
- **Account Type**: Type of account
- **Created At**: When account was added

## File Naming
Files are automatically named with the current date:
- `wealthos_portfolio_2026-04-17.csv`
- `wealthos_portfolio_2026-04-17.xlsx`

## Use Cases
- **Backup**: Regular portfolio backups
- **Analysis**: Import into Excel/Google Sheets for custom analysis
- **Tax Preparation**: Export for tax software
- **Sharing**: Send to financial advisors
- **Record Keeping**: Maintain historical portfolio snapshots

## API Endpoints
- `GET /api/portfolio/export/csv` - Download CSV file
- `GET /api/portfolio/export/excel` - Download Excel file