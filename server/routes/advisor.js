const express   = require('express');
const router    = express.Router();
const db        = require('../db');
const Anthropic = require('@anthropic-ai/sdk');

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
    default:
      return { ok: false, summary: `Unknown tool: ${name}` };
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are WealthOS AI Advisor — a sophisticated personal wealth and tax advisor with live read/write access to the user's portfolio database.

When the user asks you to add, remove, or update holdings or accounts, use the appropriate tool to make the change immediately. Confirm what you did after the action.
When the user asks for advice, analysis, or questions, answer directly without using tools.
Be specific — reference actual tickers and dollar amounts from the portfolio context.
Always consider tax efficiency across Taxable, Tax-Deferred (IRA/401k), and Tax-Free (529/Roth) buckets.`;

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

module.exports = router;
