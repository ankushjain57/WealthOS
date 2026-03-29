-- Migration: Add rebalancing target allocations table
-- Run: psql -U postgres -d wealthos -f database/migrate_rebalance.sql

CREATE TABLE IF NOT EXISTS target_allocations (
  id          SERIAL PRIMARY KEY,
  ticker      VARCHAR(10)  NOT NULL UNIQUE,
  target_pct  NUMERIC(6,2) NOT NULL CHECK (target_pct >= 0 AND target_pct <= 100),
  asset_class VARCHAR(40)  NOT NULL DEFAULT 'Equity',
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_target_ticker ON target_allocations(ticker);
