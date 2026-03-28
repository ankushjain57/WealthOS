# WealthOS — 3-Tier Architecture

## Stack
| Tier | Tech | Location |
|------|------|----------|
| Presentation | React 18 | `frontend/` · port 3000 |
| Application  | Node.js + Express | `server/` · port 3001 |
| Data         | PostgreSQL | `database/schema.sql` |

## Quick Start

### 1. Install dependencies
```bash
npm run setup
```

### 2. Create the database
```bash
npm run db:init
```
This creates the `wealthos` database, all tables, and seeds your portfolio data.

### 3. Start both servers
```bash
npm install        # install concurrently
npm run dev        # starts API on :3001 and React on :3000
```

Open http://localhost:3000

## Run individually
```bash
npm run server     # API only → http://localhost:3001
npm run frontend   # React only → http://localhost:3000
```

## Run tests
```bash
npm test
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/portfolio/holdings` | All holdings |
| GET | `/api/portfolio/summary` | Total value, day P&L |
| POST | `/api/portfolio/holdings` | Add holding |
| DELETE | `/api/portfolio/holdings/:id` | Remove holding |
| GET | `/api/analytics/metrics` | Beta, HHI, Sharpe, volatility |
| GET | `/api/analytics/sectors` | Sector breakdown |
| GET | `/api/analytics/concentration` | Top holdings by weight |
| GET | `/api/stress/all` | All 5 scenarios |
| GET | `/api/stress/:scenario` | Scenario detail |
| GET | `/api/accounts` | All accounts |
| GET | `/api/accounts/buckets` | Tax bucket totals |
| POST | `/api/accounts` | Add account |
| DELETE | `/api/accounts/:id` | Remove account |
| POST | `/api/import/excel` | Upload Empower .xlsx |

## Project Structure
```
WealthOS/
├── frontend/               Tier 1 — React SPA
│   ├── src/
│   │   ├── components/     One file per tab
│   │   ├── api.js          All API calls
│   │   ├── App.js          Nav + routing
│   │   └── index.css       WealthOS design system
│   └── package.json
├── server/                 Tier 2 — Express API
│   ├── routes/             One file per domain
│   ├── db.js               PostgreSQL pool
│   ├── index.js            Server entry point
│   └── package.json
├── database/               Tier 3 — PostgreSQL
│   └── schema.sql          Tables + seed data
├── tests/
│   └── test_suite.js
└── package.json            Root runner
```
