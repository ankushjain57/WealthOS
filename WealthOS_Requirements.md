# WealthOS — Product Requirements Document (PRD)
**Version:** 1.0.0 | **Date:** March 28, 2026

## 1. Business Objectives
| # | Objective | Priority |
|---|-----------|----------|
| O1 | Single dashboard for $15.9M net worth across 30+ accounts, 300+ holdings | Critical |
| O2 | Portfolio allocation, risk, concentration analysis | Critical |
| O3 | AI-generated trade recommendations for stated goals | High |
| O4 | Volatility metrics and stress testing vs current market | High |
| O5 | AI advisor (Claude) for on-demand Q&A | High |
| O6 | Import Empower/Schwab/Fidelity Excel exports | High |
| O7 | Add/manage accounts manually | Medium |

## 2. Functional Requirements
### Dashboard: Show KPIs (net worth, investments, cash, RE), allocation charts, top 15 holdings, daily movers, alerts
### Portfolio: All 300+ holdings, search/filter, export CSV
### Accounts: All 30 accounts, tax bucket breakdown, add new accounts
### Allocation: Sector/geo/style charts, concentration risk, target vs actual
### Risk: Portfolio beta, volatility, Sharpe, VaR at 95%/99%, category breakdown
### Stress Test: 6 macro scenarios, sector shocks, interactive slider simulator
### AI Advisor: Claude-powered chat with full portfolio context, quick insights, suggested questions
### Trades: Rebalancing, tax optimization, concentration reduction, income enhancement, custom AI plans
### Import: Excel/CSV drag-drop, manual holding entry, data source status

## 3. Non-Functional Requirements
- Performance: < 2s load, single HTML file, no server required
- Privacy: No PII sent externally, AI calls contain only portfolio context
- Accuracy: Beta/VaR clearly labeled as estimates

## 4. Acceptance Criteria
- All 300 holdings display with correct values matching Excel source
- Portfolio beta within ±0.1 of weighted manual calculation
- AI chat responds with portfolio-specific advice in < 10s
- Stress simulator responds to slider input in real-time
