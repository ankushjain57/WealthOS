const express      = require('express');
const router       = express.Router();
const db           = require('../db');
const Anthropic    = require('@anthropic-ai/sdk');
const CAPABILITIES = require('../capabilities');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Portfolio context ────────────────────────────────────────────────────────
async function buildPortfolioContext() {
  const [holdings, accounts, metrics] = await Promise.all([
    db.query('SELECT ticker, name, value FROM holdings ORDER BY value DESC LIMIT 25'),
    db.query('SELECT tax_bucket, SUM(balance) AS total FROM accounts GROUP BY tax_bucket'),
    db.query('SELECT SUM(value) AS total_value, SUM(day1_change) AS total_day1, COUNT(*) AS position_count FROM holdings'),
  ]);
  const totalValue = parseFloat(metrics.rows[0]?.total_value || 0);
  const topHoldings = holdings.rows
    .map(h => `  ${h.ticker}: $${parseFloat(h.value).toLocaleString()} (${((parseFloat(h.value)/totalValue)*100).toFixed(1)}%)`)
    .join('\n');
  const buckets = accounts.rows
    .map(b => `  ${b.tax_bucket}: $${parseFloat(b.total).toLocaleString()}`)
    .join('\n');
  return `WEALTHOS PORTFOLIO CONTEXT (Live, March 2026)
Total Investment Value: $${totalValue.toLocaleString()} | Positions: ${metrics.rows[0]?.position_count}
Today's P&L: $${parseFloat(metrics.rows[0]?.total_day1 || 0).toLocaleString()}

TOP 25 HOLDINGS:
${topHoldings}

TAX BUCKETS:
${buckets}

KEY FACTS:
- STT ~8% of investments — employer RSU concentration risk
- JEPQ + JEPI ($2.28M) in taxable accounts — ordinary income tax drag
- $1.78M idle cash below T-bill rates (5.2% available)
- $3.45M IRA at Morgan Stanley (ideal for repositioning)`;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'add_holding',
    description: 'Add a new holding/position to the portfolio database.',
    input_schema: {
      type: 'object',
      properties: {
        ticker:  { type: 'string',  description: 'Ticker symbol, e.g. VOO' },
        name:    { type: 'string',  description: 'Full security name' },
        shares:  { type: 'number', description: 'Number of shares' },
        price:   { type: 'number', description: 'Price per share in USD' },
      },
      required: ['ticker', 'shares', 'price'],
    },
  },
  {
    name: 'delete_holding',
    description: 'Remove a holding from the portfolio by ticker symbol.',
    input_schema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Ticker symbol to remove, e.g. STT' },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'update_holding',
    description: 'Update shares and/or price of an existing holding, recalculating its value.',
    input_schema: {
      type: 'object',
      properties: {
        ticker: { type: 'string',  description: 'Ticker symbol to update' },
        shares: { type: 'number', description: 'New share count (optional)' },
        price:  { type: 'number', description: 'New price per share (optional)' },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'add_account',
    description: 'Add a new account to the accounts / tax-bucket table.',
    input_schema: {
      type: 'object',
      properties: {
        institution:  { type: 'string', description: 'Bank or brokerage name' },
        account_name: { type: 'string', description: 'Account label, e.g. Roth IRA' },
        balance:      { type: 'number', description: 'Current balance in USD' },
        tax_bucket:   { type: 'string', enum: ['Taxable', 'Tax-Deferred', 'Tax-Free / Tax-Advantaged'] },
        account_type: { type: 'string', description: 'Account type, e.g. 401(k), IRA' },
      },
      required: ['institution', 'balance', 'tax_bucket'],
    },
  },
  {
    name: 'delete_account',
    description: 'Remove an account by its institution name and account name.',
    input_schema: {
      type: 'object',
      properties: {
        institution:  { type: 'string' },
        account_name: { type: 'string' },
      },
      required: ['institution', 'account_name'],
    },
  },
  {
    name: 'search_financial_news',
    description: 'Search Yahoo Finance for recent news, analyst commentary, and market coverage about specific stocks, ETFs, sectors, or financial themes. Use this proactively when the user asks about portfolio risk, opportunities, specific holdings, or market conditions — BEFORE giving a recommendation.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Financial news search query. Be specific: include ticker symbols and the theme, e.g. "STT State Street 2026 outlook" or "covered call ETF JEPQ tax drag" or "S&P 500 April 2026 correction risk"',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_market_data',
    description: 'Fetch live market data for one or more tickers: current price, daily change, P/E ratio, analyst price target, 52-week range, dividend yield, and market cap. Use this to provide real-time valuation context when discussing specific holdings.',
    input_schema: {
      type: 'object',
      properties: {
        tickers: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of ticker symbols to fetch live data for, e.g. ["STT", "JEPQ", "VOO", "BTC-USD"]',
        },
      },
      required: ['tickers'],
    },
  },
  {
    name: 'set_target_allocation',
    description: 'Set or update the target percentage for a single ticker in the rebalancing plan.',
    input_schema: {
      type: 'object',
      properties: {
        ticker:      { type: 'string', description: 'Ticker symbol, e.g. JEPQ' },
        target_pct:  { type: 'number', description: 'Target allocation as a percentage, e.g. 10.0 for 10%' },
        asset_class: { type: 'string', description: 'Asset class label, e.g. Equity, Bond, Alternatives, Cash', default: 'Equity' },
      },
      required: ['ticker', 'target_pct'],
    },
  },
  {
    name: 'compute_rebalance_plan',
    description: 'Compute the rebalancing plan: compares current holdings vs saved target allocations and returns trades (BUY/SELL) needed to reach targets.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'execute_rebalance_trades',
    description: 'Execute the rebalancing plan by updating share counts in the portfolio to match target allocations.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────
async function executeTool(name, input) {
  switch (name) {
    case 'add_holding': {
      const { ticker, name: nm, shares, price } = input;
      const value = parseFloat(shares) * parseFloat(price);
      const { rows } = await db.query(
        `INSERT INTO holdings (ticker, name, shares, price, change_pct, day1_change, value)
         VALUES ($1,$2,$3,$4,0,0,$5) RETURNING *`,
        [ticker.toUpperCase(), nm || ticker.toUpperCase(), shares, price, value]
      );
      return { ok: true, action: 'add_holding', record: rows[0], summary: `Added ${shares} shares of ${ticker.toUpperCase()} @ $${price} (value $${value.toLocaleString()})` };
    }
    case 'delete_holding': {
      const { ticker } = input;
      const { rowCount } = await db.query('DELETE FROM holdings WHERE UPPER(ticker)=UPPER($1)', [ticker]);
      if (rowCount === 0) return { ok: false, action: 'delete_holding', summary: `No holding found for ticker ${ticker}` };
      return { ok: true, action: 'delete_holding', summary: `Removed ${ticker.toUpperCase()} from portfolio` };
    }
    case 'update_holding': {
      const { ticker, shares, price } = input;
      const existing = await db.query('SELECT * FROM holdings WHERE UPPER(ticker)=UPPER($1)', [ticker]);
      if (existing.rowCount === 0) return { ok: false, action: 'update_holding', summary: `No holding found for ${ticker}` };
      const cur = existing.rows[0];
      const newShares = shares ?? parseFloat(cur.shares);
      const newPrice  = price  ?? parseFloat(cur.price);
      const newValue  = newShares * newPrice;
      await db.query(
        'UPDATE holdings SET shares=$1, price=$2, value=$3 WHERE UPPER(ticker)=UPPER($4)',
        [newShares, newPrice, newValue, ticker]
      );
      return { ok: true, action: 'update_holding', summary: `Updated ${ticker.toUpperCase()}: ${newShares} shares @ $${newPrice} = $${newValue.toLocaleString()}` };
    }
    case 'add_account': {
      const { institution, account_name, balance, tax_bucket, account_type } = input;
      const { rows } = await db.query(
        `INSERT INTO accounts (institution, account_name, balance, tax_bucket, account_type)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [institution, account_name || '', parseFloat(balance), tax_bucket, account_type || '']
      );
      return { ok: true, action: 'add_account', record: rows[0], summary: `Added account "${account_name || institution}" ($${parseFloat(balance).toLocaleString()}, ${tax_bucket})` };
    }
    case 'delete_account': {
      const { institution, account_name } = input;
      const { rowCount } = await db.query(
        'DELETE FROM accounts WHERE institution=$1 AND account_name=$2',
        [institution, account_name]
      );
      if (rowCount === 0) return { ok: false, action: 'delete_account', summary: `No account found for "${institution} / ${account_name}"` };
      return { ok: true, action: 'delete_account', summary: `Removed account "${account_name}" at ${institution}` };
    }
    case 'set_target_allocation': {
      const { ticker, target_pct, asset_class = 'Equity' } = input;
      const pct = parseFloat(target_pct);
      if (isNaN(pct) || pct < 0 || pct > 100)
        return { ok: false, action: 'set_target_allocation', summary: `Invalid target_pct: ${target_pct}` };
      await db.query(
        `INSERT INTO target_allocations (ticker, target_pct, asset_class)
         VALUES ($1, $2, $3)
         ON CONFLICT (ticker) DO UPDATE
           SET target_pct = EXCLUDED.target_pct,
               asset_class = EXCLUDED.asset_class,
               updated_at = NOW()`,
        [ticker.toUpperCase(), pct, asset_class]
      );
      return { ok: true, action: 'set_target_allocation', summary: `Set target for ${ticker.toUpperCase()} to ${pct}% (${asset_class})` };
    }
    case 'compute_rebalance_plan': {
      const [holdingsRes, targetsRes, totalRes] = await Promise.all([
        db.query('SELECT ticker, shares, price, value FROM holdings'),
        db.query('SELECT ticker, target_pct, asset_class FROM target_allocations'),
        db.query('SELECT SUM(value) AS total FROM holdings'),
      ]);
      const totalValue  = parseFloat(totalRes.rows[0]?.total || 0);
      const holdingsMap = Object.fromEntries(holdingsRes.rows.map(h => [h.ticker.toUpperCase(), h]));
      const trades = targetsRes.rows.map(t => {
        const holding    = holdingsMap[t.ticker.toUpperCase()];
        const targetPct  = parseFloat(t.target_pct);
        const targetVal  = (targetPct / 100) * totalValue;
        const currentVal = holding ? parseFloat(holding.value) : 0;
        const currentPct = totalValue > 0 ? (currentVal / totalValue) * 100 : 0;
        const deltaValue = targetVal - currentVal;
        const price      = holding ? parseFloat(holding.price) : null;
        const deltaShares = price && price > 0 ? (deltaValue / price).toFixed(2) : null;
        return {
          ticker: t.ticker.toUpperCase(),
          current_pct: parseFloat(currentPct.toFixed(2)),
          target_pct: targetPct,
          delta_value: parseFloat(deltaValue.toFixed(2)),
          delta_shares: deltaShares,
          action: Math.abs(deltaValue) < 100 ? 'HOLD' : deltaValue > 0 ? 'BUY' : 'SELL',
        };
      });
      const totalTargetPct = targetsRes.rows.reduce((s, t) => s + parseFloat(t.target_pct), 0);
      const summary = trades.map(t =>
        `${t.ticker}: ${t.action} (${t.current_pct}% → ${t.target_pct}%, delta $${t.delta_value.toLocaleString()}, ${t.delta_shares ?? 'N/A'} shares)`
      ).join('\n');
      return { ok: true, action: 'compute_rebalance_plan', trades, totalTargetPct: parseFloat(totalTargetPct.toFixed(2)), summary: `Rebalance plan (${trades.length} positions, total target ${totalTargetPct.toFixed(1)}%):\n${summary}` };
    }
    case 'execute_rebalance_trades': {
      const [holdingsRes, targetsRes, totalRes] = await Promise.all([
        db.query('SELECT ticker, shares, price, value FROM holdings'),
        db.query('SELECT ticker, target_pct FROM target_allocations'),
        db.query('SELECT SUM(value) AS total FROM holdings'),
      ]);
      const totalValue  = parseFloat(totalRes.rows[0]?.total || 0);
      const holdingsMap = Object.fromEntries(holdingsRes.rows.map(h => [h.ticker.toUpperCase(), h]));
      const applied = [], skipped = [];
      for (const t of targetsRes.rows) {
        const ticker    = t.ticker.toUpperCase();
        const holding   = holdingsMap[ticker];
        if (!holding) { skipped.push(ticker); continue; }
        const targetVal  = (parseFloat(t.target_pct) / 100) * totalValue;
        const price      = parseFloat(holding.price);
        if (price <= 0) { skipped.push(ticker); continue; }
        const newShares  = targetVal / price;
        const newValue   = newShares * price;
        await db.query(
          'UPDATE holdings SET shares = $1, value = $2 WHERE UPPER(ticker) = $3',
          [parseFloat(newShares.toFixed(4)), parseFloat(newValue.toFixed(2)), ticker]
        );
        applied.push(ticker);
      }
      return { ok: true, action: 'execute_rebalance_trades', summary: `Executed rebalance: updated ${applied.length} positions (${applied.join(', ')}). Skipped: ${skipped.join(', ') || 'none'}.` };
    }
    case 'search_financial_news': {
      const { query } = input;
      try {
        const result = await yf.search(query, { newsCount: 8, quotesCount: 0 }, { validateResult: false });
        const news = (result.news || []).slice(0, 8).map(n => ({
          title:     n.title,
          publisher: n.publisher,
          link:      n.link,
          published: n.providerPublishTime
            ? new Date(n.providerPublishTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Recent',
        }));
        const summary = news.length
          ? `Found ${news.length} articles for "${query}":\n` + news.map(n => `• "${n.title}" — ${n.publisher} (${n.published})\n  ${n.link}`).join('\n')
          : `No news found for "${query}" — try a broader search term.`;
        return { ok: true, action: 'search_financial_news', news, query, summary };
      } catch (err) {
        return { ok: false, action: 'search_financial_news', news: [], query, summary: `News search failed: ${err.message}` };
      }
    }
    case 'get_market_data': {
      const { tickers } = input;
      const safeTickers = (tickers || []).slice(0, 10).map(t => t.trim().toUpperCase());
      try {
        const results = await Promise.allSettled(
          safeTickers.map(t => yf.quote(t, {}, { validateResult: false }))
        );
        const data = [];
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value && r.value.regularMarketPrice != null) {
            const q = r.value;
            data.push({
              ticker:         safeTickers[i],
              name:           q.shortName || q.longName || safeTickers[i],
              price:          q.regularMarketPrice,
              change_pct:     q.regularMarketChangePercent != null ? +q.regularMarketChangePercent.toFixed(2) : null,
              market_cap:     q.marketCap || null,
              pe_ratio:       q.trailingPE != null ? +q.trailingPE.toFixed(1) : null,
              week52_high:    q.fiftyTwoWeekHigh || null,
              week52_low:     q.fiftyTwoWeekLow  || null,
              analyst_target: q.targetMeanPrice != null ? +q.targetMeanPrice.toFixed(2) : null,
              dividend_yield: q.trailingAnnualDividendYield != null ? +(q.trailingAnnualDividendYield * 100).toFixed(2) : null,
              volume:         q.regularMarketVolume || null,
            });
          }
        });
        const fmtCap = v => !v ? 'N/A' : v >= 1e12 ? `$${(v/1e12).toFixed(1)}T` : v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : `$${(v/1e6).toFixed(0)}M`;
        const summary = `Live market data (${data.length} tickers):\n` + data.map(d =>
          `${d.ticker} (${d.name}): $${d.price} (${d.change_pct != null ? (d.change_pct >= 0 ? '+' : '') + d.change_pct + '%' : 'N/A'}) | P/E: ${d.pe_ratio ?? 'N/A'} | 52w: $${d.week52_low ?? '?'}–$${d.week52_high ?? '?'} | Target: $${d.analyst_target ?? 'N/A'} | Yield: ${d.dividend_yield ?? '0'}% | Cap: ${fmtCap(d.market_cap)}`
        ).join('\n');
        return { ok: true, action: 'get_market_data', data, summary };
      } catch (err) {
        return { ok: false, action: 'get_market_data', data: [], summary: `Market data fetch failed: ${err.message}` };
      }
    }
    default:
      return { ok: false, summary: `Unknown tool: ${name}` };
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are WealthOS AI Advisor — a sophisticated personal wealth and tax advisor with live read/write access to the user's portfolio AND real-time access to financial news and live market data.

## Research-First Approach
For ANY question about portfolio risk, opportunities, specific holdings, or market conditions — ALWAYS:
1. Use search_financial_news to find recent relevant news (1–2 targeted searches)
2. Use get_market_data to get live prices, P/E ratios, and analyst targets for the relevant tickers
3. Then synthesize the live data + news with portfolio context into your recommendation
4. Always cite your sources inline: mention the publisher and headline for key claims

## When to search proactively (do this before answering)
- User asks about risk or drawdown → search news for their top holdings, then fetch live market data
- User asks about a specific holding → search news about that ticker + get its live market data
- User asks about market conditions → search for current macro/sector news
- User asks about tax strategy → search for recent tax law updates relevant to their holdings
- User asks about an ETF or fund → search for recent analyst commentary and fund flows
- User asks about deploying cash → search for current T-bill/CD/money market rates

## Portfolio Actions (no news search needed)
When the user asks to add, remove, or update holdings or accounts, use the appropriate database tool immediately. Confirm what you did after.

## Style Guidelines
- Reference actual ticker symbols and dollar amounts from the portfolio context
- After citing news, explain what it means specifically for this portfolio
- Always consider tax efficiency: Taxable vs Tax-Deferred (IRA/401k) vs Tax-Free (529/Roth)
- Cite news inline as: [Publisher — "Headline"]
- Format monetory figures with commas and dollar signs

${CAPABILITIES.toSystemPromptSection()}`;


// ─── Chat endpoint ────────────────────────────────────────────────────────────
/**
 * POST /api/advisor/chat
 * Body: { message: string, history: [{role, content}] }
 * Returns: { reply: string, actions: [{ok, action, summary}] }
 */
router.post('/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length === 0)
    return res.status(400).json({ error: 'message is required' });
  if (message.length > 2000)
    return res.status(400).json({ error: 'message too long (max 2000 chars)' });

  try {
    const portfolioContext = await buildPortfolioContext();
    const contextualMessage = `${portfolioContext}\n\nUser: ${message.trim()}`;

    const safeHistory = history.slice(-10).filter(
      m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    );

    const messages = [...safeHistory, { role: 'user', content: contextualMessage }];
    const actions  = [];

    // Agentic loop: keep going until Claude stops using tools
    while (true) {
      const response = await client.messages.create({
        model:      'claude-opus-4-5',
        max_tokens: 1024,
        system:     SYSTEM_PROMPT,
        tools:      TOOLS,
        messages,
      });

      // If Claude wants to use tools, execute them and feed results back
      if (response.stop_reason === 'tool_use') {
        const assistantMsg = { role: 'assistant', content: response.content };
        messages.push(assistantMsg);

        const toolResults = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          const result = await executeTool(block.name, block.input);
          actions.push(result);
          toolResults.push({
            type:        'tool_result',
            tool_use_id: block.id,
            content:     result.summary,
          });
        }
        messages.push({ role: 'user', content: toolResults });
        continue; // loop again so Claude can respond after seeing tool results
      }

      // Claude is done — extract final text reply
      const reply = response.content.find(b => b.type === 'text')?.text || 'Done.';
      return res.json({ reply, actions });
    }
  } catch (err) {
    console.error('Advisor error:', err.message);
    res.status(500).json({ error: 'AI service unavailable. Check ANTHROPIC_API_KEY.' });
  }
});

// ─── Capabilities endpoint ────────────────────────────────────────────────────
/**
 * GET /api/advisor/capabilities
 * Returns the structured can/cannot-do lists for the frontend to display.
 */
router.get('/capabilities', (req, res) => {
  res.json({
    canDo:    CAPABILITIES.canDo,
    cannotDo: CAPABILITIES.cannotDo,
  });
});

module.exports = router;
