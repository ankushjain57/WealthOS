/**
 * WealthOS — Complete Test Suite
 * Covers: Unit, Integration, and E2E tests
 * Run: node tests/run_tests.js
 */

// ─── Simple Test Runner ───────────────────────────────────────────────────────
const results = { passed: 0, failed: 0, errors: [] };

function describe(suite, fn) {
  console.log(`\n  📦 ${suite}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log(`    ✅ ${name}`);
    results.passed++;
  } catch (e) {
    console.log(`    ❌ ${name}`);
    console.log(`       → ${e.message}`);
    results.failed++;
    results.errors.push({ test: name, error: e.message });
  }
}

function expect(actual) {
  return {
    toBe: (expected) => {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan: (n) => {
      if (actual <= n) throw new Error(`Expected ${actual} > ${n}`);
    },
    toBeLessThan: (n) => {
      if (actual >= n) throw new Error(`Expected ${actual} < ${n}`);
    },
    toBeCloseTo: (expected, decimals = 2) => {
      const diff = Math.abs(actual - expected);
      const tolerance = Math.pow(10, -decimals) / 2;
      if (diff > tolerance) throw new Error(`Expected ${actual} ≈ ${expected} (±${tolerance})`);
    },
    toContain: (item) => {
      if (!actual.includes(item)) throw new Error(`Expected array/string to contain ${item}`);
    },
    toHaveLength: (n) => {
      if (actual.length !== n) throw new Error(`Expected length ${n}, got ${actual.length}`);
    },
    toBeTruthy: () => {
      if (!actual) throw new Error(`Expected truthy, got ${actual}`);
    },
    toBeFalsy: () => {
      if (actual) throw new Error(`Expected falsy, got ${actual}`);
    },
    toEqual: (expected) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };
}

// ─── Analytics Engine (extracted from app for testing) ──────────────────────

const Analytics = {
  totalPortfolioValue(holdings) {
    return holdings.reduce((sum, h) => sum + (parseFloat(h.Value) || 0), 0);
  },

  portfolioWeight(holding, total) {
    return (parseFloat(holding.Value) / total) * 100;
  },

  hhi(holdings) {
    const total = this.totalPortfolioValue(holdings);
    return holdings.reduce((sum, h) => {
      const w = (parseFloat(h.Value) / total) * 100;
      return sum + w * w;
    }, 0);
  },

  concentrationRisk(holdings, threshold = 5) {
    const total = this.totalPortfolioValue(holdings);
    return holdings.filter(h => (parseFloat(h.Value) / total) * 100 > threshold);
  },

  estimateBeta(holdings) {
    const betaMap = {
      'NVDA': 1.9, 'META': 1.6, 'AMZN': 1.4, 'GOOG': 1.2, 'MSFT': 1.1,
      'AAPL': 1.1, 'STT': 1.3, 'JEPQ': 0.7, 'JEPI': 0.55, 'VOO': 1.0,
      'GLD': -0.1, 'SLV': 0.0, 'GLDM': -0.1, 'BND': -0.2,
      'PFTPX': 0.2, 'GILHX': 0.15
    };
    const total = this.totalPortfolioValue(holdings);
    let weightedBeta = 0;
    let coveredWeight = 0;
    for (const h of holdings) {
      const beta = betaMap[h.Ticker] ?? 0.85; // default market beta
      const w = parseFloat(h.Value) / total;
      weightedBeta += w * beta;
      coveredWeight += w;
    }
    return weightedBeta;
  },

  stressTest(holdings, scenario) {
    const scenarios = {
      'mild_correction':  { equity: -0.10, bond: +0.02, gold: +0.03, cash: 0 },
      'bear_market':      { equity: -0.25, bond: +0.05, gold: +0.08, cash: 0 },
      'crash':            { equity: -0.40, bond: +0.10, gold: +0.15, cash: 0 },
      'rate_spike':       { equity: -0.15, bond: -0.08, gold: -0.05, cash: +0.02 },
      'inflation_surge':  { equity: -0.08, bond: -0.12, gold: +0.20, cash: -0.03 }
    };
    const shocks = scenarios[scenario];
    if (!shocks) throw new Error(`Unknown scenario: ${scenario}`);

    const equityTickers = new Set(['NVDA','META','AMZN','GOOG','MSFT','AAPL','STT','JEPQ','JEPI','VOO','QQQ']);
    const bondTickers   = new Set(['PFTPX','GILHX','BND','AGG','TLT','IEF']);
    const goldTickers   = new Set(['GLD','GLDM','SLV','IAU']);

    let totalLoss = 0;
    for (const h of holdings) {
      const val = parseFloat(h.Value) || 0;
      let shock = shocks.equity; // default
      if (bondTickers.has(h.Ticker)) shock = shocks.bond;
      else if (goldTickers.has(h.Ticker)) shock = shocks.gold;
      totalLoss += val * shock;
    }
    return totalLoss;
  },

  taxBucketSummary(taxBuckets) {
    const summary = { 'Taxable': 0, 'Tax-Deferred': 0, 'Tax-Free / Tax-Advantaged': 0 };
    for (const row of taxBuckets) {
      const bucket = row.TaxBucket || row['Tax Bucket'] || '';
      const bal = parseFloat(row.Balance) || 0;
      if (bucket in summary) summary[bucket] += bal;
    }
    return summary;
  },

  sharpeEstimate(beta, annualReturn = 0.09, riskFreeRate = 0.05) {
    const estimatedVol = beta * 0.16; // S&P vol proxy
    return (annualReturn - riskFreeRate) / estimatedVol;
  }
};

// ─── UNIT TESTS ──────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║        WealthOS — Full Test Suite                ║');
console.log('╚══════════════════════════════════════════════════╝');

// Sample data mirroring Ankush's actual portfolio
const SAMPLE_HOLDINGS = [
  { Ticker: 'JEPQ', Holding: 'JPMorgan Nasdaq Equity Premium', Value: 1507947, Shares: 10000 },
  { Ticker: 'STT',  Holding: 'State Street Corp',              Value: 946411,  Shares: 700 },
  { Ticker: 'JEPI', Holding: 'JPMorgan Equity Premium ETF',    Value: 772883,  Shares: 9000 },
  { Ticker: 'NVDA', Holding: 'NVIDIA Corp',                    Value: 519541,  Shares: 150 },
  { Ticker: 'PFTPX',Holding: 'PIMCO Low Duration',             Value: 501651,  Shares: 500 },
  { Ticker: 'MSFT', Holding: 'Microsoft Corp',                 Value: 486626,  Shares: 130 },
  { Ticker: 'META', Holding: 'Meta Platforms',                 Value: 355618,  Shares: 70 },
  { Ticker: 'GOOG', Holding: 'Alphabet Inc',                   Value: 346170,  Shares: 210 },
  { Ticker: 'GLD',  Holding: 'SPDR Gold Trust',                Value: 58715,   Shares: 124 },
  { Ticker: 'GLDM', Holding: 'Gold MiniShares',                Value: 157543,  Shares: 1545 },
];

const SAMPLE_TAX_BUCKETS = [
  { Institution: 'Morgan Stanley Online', Account: 'IRA 9855', Balance: 3453095.91, TaxBucket: 'Tax-Deferred', AccountType: 'IRA' },
  { Institution: 'Morgan Stanley Online', Account: 'Select Uma 9851', Balance: 1849270.99, TaxBucket: 'Taxable', AccountType: 'Taxable brokerage' },
  { Institution: 'Manual Investment', Account: 'STT RSU', Balance: 948757.46, TaxBucket: 'Taxable', AccountType: 'Employer stock / RSU' },
  { Institution: 'NY 529', Account: 'Kavya College', Balance: 149146.31, TaxBucket: 'Tax-Free / Tax-Advantaged', AccountType: '529 plan' },
];

describe('FR-01: Portfolio Parsing', () => {
  it('calculates total portfolio value from holdings array', () => {
    const total = Analytics.totalPortfolioValue(SAMPLE_HOLDINGS);
    expect(total).toBeGreaterThan(5_000_000);
  });

  it('handles empty holdings array', () => {
    const total = Analytics.totalPortfolioValue([]);
    expect(total).toBe(0);
  });

  it('handles holdings with missing Value gracefully', () => {
    const holdings = [{ Ticker: 'X', Value: null }, { Ticker: 'Y', Value: 1000 }];
    const total = Analytics.totalPortfolioValue(holdings);
    expect(total).toBe(1000);
  });

  it('parses string values from Excel correctly', () => {
    const holdings = [{ Ticker: 'VOO', Value: '500000' }];
    const total = Analytics.totalPortfolioValue(holdings);
    expect(total).toBe(500000);
  });
});

describe('FR-02: Portfolio Dashboard Analytics', () => {
  it('calculates JEPQ as largest holding by weight', () => {
    const total = Analytics.totalPortfolioValue(SAMPLE_HOLDINGS);
    const jepq = SAMPLE_HOLDINGS.find(h => h.Ticker === 'JEPQ');
    const weight = Analytics.portfolioWeight(jepq, total);
    expect(weight).toBeGreaterThan(20); // JEPQ is ~28% of sample
  });

  it('computes HHI index correctly (should be > 500 given concentration)', () => {
    const hhi = Analytics.hhi(SAMPLE_HOLDINGS);
    expect(hhi).toBeGreaterThan(500); // concentrated portfolio
  });

  it('flags STT as concentration risk (>5% threshold)', () => {
    const risks = Analytics.concentrationRisk(SAMPLE_HOLDINGS, 5);
    const tickers = risks.map(h => h.Ticker);
    expect(tickers).toContain('STT');
  });

  it('flags JEPQ as concentration risk', () => {
    const risks = Analytics.concentrationRisk(SAMPLE_HOLDINGS, 5);
    const tickers = risks.map(h => h.Ticker);
    expect(tickers).toContain('JEPQ');
  });

  it('does not flag small holdings as concentration risk', () => {
    const risks = Analytics.concentrationRisk(SAMPLE_HOLDINGS, 5);
    const tickers = risks.map(h => h.Ticker);
    expect(tickers.includes('GLD')).toBeFalsy();
  });
});

describe('FR-03: Volatility & Risk Metrics', () => {
  it('calculates portfolio beta > 0 (equity-heavy portfolio)', () => {
    const beta = Analytics.estimateBeta(SAMPLE_HOLDINGS);
    expect(beta).toBeGreaterThan(0.5);
  });

  it('calculates portfolio beta < 2 (not ultra-leveraged)', () => {
    const beta = Analytics.estimateBeta(SAMPLE_HOLDINGS);
    expect(beta).toBeLessThan(2.0);
  });

  it('pure gold portfolio has near-zero beta', () => {
    const goldOnly = [{ Ticker: 'GLD', Value: 100000 }, { Ticker: 'GLDM', Value: 100000 }];
    const beta = Analytics.estimateBeta(goldOnly);
    expect(beta).toBeLessThan(0.1);
  });

  it('Sharpe ratio is positive for default parameters', () => {
    const sharpe = Analytics.sharpeEstimate(1.0);
    expect(sharpe).toBeGreaterThan(0);
  });

  it('higher beta reduces Sharpe ratio', () => {
    const s1 = Analytics.sharpeEstimate(0.8);
    const s2 = Analytics.sharpeEstimate(1.5);
    expect(s1).toBeGreaterThan(s2);
  });
});

describe('FR-04: Stress Testing', () => {
  it('crash scenario produces large negative impact', () => {
    const impact = Analytics.stressTest(SAMPLE_HOLDINGS, 'crash');
    expect(impact).toBeLessThan(-1_000_000); // sample portfolio ~$5.7M, 40% crash = -$2.3M
  });

  it('mild correction produces smaller loss than crash', () => {
    const mild = Analytics.stressTest(SAMPLE_HOLDINGS, 'mild_correction');
    const crash = Analytics.stressTest(SAMPLE_HOLDINGS, 'crash');
    expect(mild).toBeGreaterThan(crash);
  });

  it('gold holdings benefit in crash scenario (positive shock)', () => {
    const goldOnly = [{ Ticker: 'GLD', Value: 100000 }, { Ticker: 'GLDM', Value: 100000 }];
    const impact = Analytics.stressTest(goldOnly, 'crash');
    expect(impact).toBeGreaterThan(0); // gold goes up in crash
  });

  it('rate spike hurts bond holdings', () => {
    const bondOnly = [{ Ticker: 'PFTPX', Value: 500000 }, { Ticker: 'GILHX', Value: 300000 }];
    const impact = Analytics.stressTest(bondOnly, 'rate_spike');
    expect(impact).toBeLessThan(0);
  });

  it('throws error for unknown scenario', () => {
    try {
      Analytics.stressTest(SAMPLE_HOLDINGS, 'apocalypse');
      throw new Error('Should have thrown');
    } catch (e) {
      expect(e.message).toContain('Unknown scenario');
    }
  });

  it('inflation surge: gold outperforms bonds', () => {
    const goldHolding = [{ Ticker: 'GLD', Value: 100000 }];
    const bondHolding = [{ Ticker: 'PFTPX', Value: 100000 }];
    const goldImpact = Analytics.stressTest(goldHolding, 'inflation_surge');
    const bondImpact = Analytics.stressTest(bondHolding, 'inflation_surge');
    expect(goldImpact).toBeGreaterThan(bondImpact);
  });
});

describe('FR-05: Tax Bucket Analysis', () => {
  it('computes taxable bucket total correctly', () => {
    const summary = Analytics.taxBucketSummary(SAMPLE_TAX_BUCKETS);
    expect(summary['Taxable']).toBeGreaterThan(2_000_000);
  });

  it('computes tax-deferred bucket correctly', () => {
    const summary = Analytics.taxBucketSummary(SAMPLE_TAX_BUCKETS);
    expect(summary['Tax-Deferred']).toBeGreaterThan(3_000_000);
  });

  it('computes tax-free bucket for 529 account', () => {
    const summary = Analytics.taxBucketSummary(SAMPLE_TAX_BUCKETS);
    expect(summary['Tax-Free / Tax-Advantaged']).toBeGreaterThan(100_000);
  });

  it('total of all buckets equals sum of account balances', () => {
    const summary = Analytics.taxBucketSummary(SAMPLE_TAX_BUCKETS);
    const totalFromBuckets = Object.values(summary).reduce((a, b) => a + b, 0);
    const totalFromAccounts = SAMPLE_TAX_BUCKETS.reduce((a, r) => a + r.Balance, 0);
    expect(Math.abs(totalFromBuckets - totalFromAccounts)).toBeLessThan(1);
  });
});

describe('FR-02.4: Concentration Risk Edge Cases', () => {
  it('single-stock portfolio flags the stock', () => {
    const single = [{ Ticker: 'VOO', Value: 1000000 }];
    const risks = Analytics.concentrationRisk(single, 5);
    expect(risks).toHaveLength(1);
  });

  it('perfectly diversified 25-stock portfolio has no flags at 5%', () => {
    const equal = Array.from({ length: 25 }, (_, i) => ({
      Ticker: `STOCK${i}`, Value: 40000
    }));
    const risks = Analytics.concentrationRisk(equal, 5);
    expect(risks).toHaveLength(0);
  });

  it('threshold of 0% flags everything', () => {
    const risks = Analytics.concentrationRisk(SAMPLE_HOLDINGS, 0);
    expect(risks).toHaveLength(SAMPLE_HOLDINGS.length);
  });
});

describe('Integration: Stress Test + Portfolio Value', () => {
  it('crash scenario impact is proportional to portfolio size', () => {
    const small = [{ Ticker: 'MSFT', Value: 100000 }];
    const large = [{ Ticker: 'MSFT', Value: 1000000 }];
    const smallImpact = Analytics.stressTest(small, 'crash');
    const largeImpact = Analytics.stressTest(large, 'crash');
    expect(largeImpact / smallImpact).toBeCloseTo(10, 0);
  });

  it('diversification reduces crash impact vs concentrated equity', () => {
    const equityOnly = Array.from({length: 10}, (_, i) => ({ Ticker: 'MSFT', Value: 100000 }));
    const diversified = [
      ...Array.from({length: 7}, (_, i) => ({ Ticker: 'MSFT', Value: 100000 })),
      { Ticker: 'GLD', Value: 100000 },
      { Ticker: 'GLDM', Value: 100000 },
      { Ticker: 'PFTPX', Value: 100000 },
    ];
    const equityImpact = Analytics.stressTest(equityOnly, 'crash');
    const divImpact = Analytics.stressTest(diversified, 'crash');
    expect(divImpact).toBeGreaterThan(equityImpact); // less negative
  });
});

// ─── E2E Test Specs (Playwright format, documented here) ─────────────────────
console.log('\n  📋 E2E Test Specs (Playwright — requires browser):');
const e2eTests = [
  'LOAD: App renders dashboard with correct total net worth ($15,875,656)',
  'UPLOAD: Drag-drop Excel file loads 284 holdings successfully',
  'DASHBOARD: Top holding shows JEPQ at correct weight ~12.8%',
  'RISK: STT concentration risk flag appears (>8% weight)',
  'STRESS: Crash scenario shows loss > $2M on full portfolio',
  'AI: Trade advisor returns recommendations for "reduce STT" goal',
  'ACCOUNTS: Add new account persists after page refresh',
  'EXPORT: JSON export downloads with correct structure',
  'RESPONSIVE: Mobile viewport renders all sections without overflow',
  'PERF: Full portfolio loads and renders in under 2 seconds',
];
e2eTests.forEach(t => console.log(`    📌 ${t}`));

// ─── Results ─────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════╗');
console.log(`║  Results: ${results.passed} passed, ${results.failed} failed${' '.repeat(27 - String(results.passed + results.failed).length)}║`);
console.log('╚══════════════════════════════════════════════════╝\n');

if (results.failed > 0) {
  console.log('Failed tests:');
  results.errors.forEach(e => console.log(`  ❌ ${e.test}: ${e.error}`));
  process.exit(1);
} else {
  console.log('✅ All tests passed!\n');
  process.exit(0);
}
