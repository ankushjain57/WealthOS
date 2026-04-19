-- WealthOS Database Schema
-- Run: psql -U postgres -f schema.sql

CREATE DATABASE wealthos;
\c wealthos;

-- Holdings table
CREATE TABLE IF NOT EXISTS holdings (
  id          SERIAL PRIMARY KEY,
  ticker      VARCHAR(10)  NOT NULL,
  name        VARCHAR(100) NOT NULL,
  shares      NUMERIC(18,4) DEFAULT 0,
  price       NUMERIC(18,4) DEFAULT 0,
  change_pct  NUMERIC(8,4)  DEFAULT 0,
  day1_change NUMERIC(18,2) DEFAULT 0,
  value       NUMERIC(18,2) NOT NULL,
  imported_at TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX idx_holdings_ticker ON holdings(ticker);
CREATE INDEX idx_holdings_value  ON holdings(value DESC);

-- Accounts / tax buckets table
CREATE TABLE IF NOT EXISTS accounts (
  id           SERIAL PRIMARY KEY,
  institution  VARCHAR(60)  NOT NULL,
  account_name VARCHAR(80)  NOT NULL DEFAULT '',
  balance      NUMERIC(18,2) NOT NULL,
  tax_bucket   VARCHAR(40)  NOT NULL DEFAULT 'Taxable',
  account_type VARCHAR(60)  NOT NULL DEFAULT '',
  product_type VARCHAR(60)  NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_accounts_bucket ON accounts(tax_bucket);

-- Snapshots (net worth over time)
CREATE TABLE IF NOT EXISTS snapshots (
  id         SERIAL PRIMARY KEY,
  snap_date  DATE          NOT NULL DEFAULT CURRENT_DATE,
  net_worth  NUMERIC(18,2) NOT NULL,
  investments NUMERIC(18,2) NOT NULL DEFAULT 0,
  cash       NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ   DEFAULT NOW()
);

-- Seed with your current data
INSERT INTO holdings (ticker, name, shares, price, change_pct, day1_change, value) VALUES
('JEPQ','J P Morgan Nasdaq Equity Premium',10000,150.79,0,0,1507947.27),
('STT','State Street Corp',700,1352.02,0,-32057.9,946411.76),
('JEPI','JPMorgan Equity Premium Income ETF',9000,85.88,0,-7051.62,772883.96),
('NVDA','NVIDIA Corp',150,3463.61,0,-16127.94,519541.67),
('PFTPX','PIMCO Low Duration Income Fund',500,1003.30,0,-1214.65,501651.12),
('MSFT','Microsoft Corp',130,3743.28,0,-2046.65,486626.41),
('META','Meta Platforms Inc',70,5080.26,0,-8663.53,355618.36),
('GOOG','Alphabet Inc',210,1648.43,0,-3028.84,346170.29),
('GILHX','Guggenheim Limited Duration Fund',302923,1.0,0,0,302923.04),
('SLV','iShares Silver Trust',3000,58.90,0,3886.09,176712.38),
('GLDM','SPDR Gold MiniShares',1545,102.0,0,2456.55,157543.65),
('AAPL','Apple Inc',100,2252.12,0,-2475.53,225211.85),
('FTLS','First Trust Long/Short Equity ETF',1200,119.06,0,-1586.52,142868.16),
('BIP','Brookfield Infrastructure Partners',2000,69.56,0,-1517.0,139120.00),
('AMZN','Amazon.com Inc',60,2259.83,0,-3643.96,135589.83),
('IXC','iShares Global Energy ETF',1200,87.70,0,760.0,105240.00),
('IBIT','iShares Bitcoin Trust',500,207.44,0,0,103718.20),
('AVGO','Broadcom Inc',30,3215.92,0,-668.52,96477.69),
('IWB','iShares Russell 1000 ETF',700,129.00,0,-1200.5,90294.75);

INSERT INTO accounts (institution, account_name, balance, tax_bucket, account_type) VALUES
('Morgan Stanley Online','Select Uma Ira - Ending in 9855',3453095.91,'Tax-Deferred','IRA'),
('Morgan Stanley Online','Select Uma - Ending in 9851',1849270.99,'Taxable','Taxable brokerage'),
('Morgan Stanley Online','Platinum Cashplus - Ending in 3225',1046095.45,'Taxable','Cash / taxable'),
('Morgan Stanley Online','Aaa - Ending in 9850',976878.00,'Taxable','Cash / taxable'),
('Morgan Stanley Online','Select Uma - Ending in 7589',972618.76,'Taxable','Taxable brokerage'),
('Manual Investment Holdings','Fidelity State Street RSU',948757.46,'Taxable','Employer stock / RSU'),
('Morgan Stanley Online','Aaa - Ending in 0011',604959.40,'Taxable','Cash / taxable'),
('Morgan Stanley Online','Prudential 401 - IRA3229',489284.49,'Tax-Deferred','IRA / rollover IRA'),
('Morgan Stanley Online','Ira - Ending in 3205',389921.68,'Tax-Deferred','IRA'),
('Morgan Stanley Online','Select Uma Ira - Ending in 0001',333506.07,'Tax-Deferred','IRA'),
('Morgan Stanley Online','Select Uma Ira - Ending in 9854',170700.45,'Tax-Deferred','IRA'),
('NY 529 Advisor Guided College','Kavya College Account',149146.31,'Tax-Free / Tax-Advantaged','529 plan'),
('Morgan Stanley Online','Aaa - Ending in 0012',130525.58,'Taxable','Cash / taxable'),
('Wells Fargo','CD1 - 7862',108843.86,'Taxable','CD / taxable'),
('ScholarsEdge 529 Plan','Megha Jain - Ending in 6901',71277.90,'Tax-Free / Tax-Advantaged','529 plan'),
('Wells Fargo','CD2 - 8879',52883.90,'Taxable','CD / taxable'),
('Manual Investment Holdings','Coinbase',47686.98,'Taxable','Crypto / taxable'),
('Treasury Direct','Savings Bonds',33812.00,'Taxable','Savings bonds / taxable'),
('Manual Investment Holdings','MS Stock Purchase Plan',33450.99,'Taxable','Employee stock purchase');

INSERT INTO snapshots (snap_date, net_worth, investments, cash) VALUES
('2026-03-09', 15875656, 11740855, 1778501);
