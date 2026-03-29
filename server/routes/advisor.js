const express   = require('express');
const router    = express.Router();
const db        = require('../db');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Build a real-time portfolio context string from the database
async function buildPortfolioContext() {
  const [holdings, accounts, metrics] = await Promise.all([
    db.query('SELECT ticker, name, value FROM holdings ORDER BY value DESC LIMIT 25'),
    db.query('SELECT tax_bucket, SUM(balance) AS total FROM accounts GROUP BY tax_bucket'),
    db.query(`
      SELECT SUM(value) AS total_value, SUM(day1_change) AS total_day1,
             COUNT(*) AS position_count FROM holdings
    `)
  ]);

  const totalValue = parseFloat(metrics.rows[0]?.total_value || 0);
  const topHoldings = holdings.rows
    .map(h => `  ${h.ticker}: $${parseFloat(h.value).toLocaleString()} (${((parseFloat(h.value)/totalValue)*100).toFixed(1)}%)`)
    .join('\n');

  const buckets = accounts.rows
    .map(b => `  ${b.tax_bucket}: $${parseFloat(b.total).toLocaleString()}`)
    .join('\n');

  return `
WEALTHOS PORTFOLIO CONTEXT (Live, March 2026)
Total Investment Value: $${totalValue.toLocaleString()}
Total Net Worth: ~$15,875,656
Positions: ${metrics.rows[0]?.position_count}
Today's P&L: $${parseFloat(metrics.rows[0]?.total_day1 || 0).toLocaleString()}

TOP 25 HOLDINGS BY VALUE:
${topHoldings}

TAX BUCKET BREAKDOWN:
${buckets}

KEY FACTS:
- STT (State Street Corp): ~8% of investments — employer RSU concentration risk
- JEPQ + JEPI ($2.28M): covered-call ETFs in taxable accounts — ordinary income tax drag
- $1.78M idle cash earning below T-bill rates (5.2% available)
- $3.45M IRA at Morgan Stanley (tax-deferred, ideal for repositioning)
- Two 529 college accounts (Kavya $149K, Megha $71K)
- Real estate: primary home (Morganville NJ) + 2 rental properties
`;
}

const SYSTEM_PROMPT = `You are WealthOS AI Advisor — a sophisticated, context-aware personal wealth and tax advisor.
You have direct access to the user's live portfolio. Be specific, actionable, and reference actual tickers and dollar amounts.
Keep responses focused and concise. Use plain text with clear sections. Avoid unnecessary hedging.
Always consider tax efficiency across the user's three buckets: Taxable, Tax-Deferred (IRA/401k), Tax-Free (529/Roth).`;

/**
 * POST /api/advisor/chat
 * Body: { message: string, history: [{role, content}] }
 * Returns: { reply: string }
 */
router.post('/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: 'message too long (max 2000 chars)' });
  }

  try {
    const portfolioContext = await buildPortfolioContext();

    // Prepend portfolio context to the first user message of this session
    const contextualMessage = `${portfolioContext}\n\nUser question: ${message.trim()}`;

    // Build messages array: history (max last 10 turns) + new message
    const safeHistory = history.slice(-10).filter(
      m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    );
    const messages = [
      ...safeHistory,
      { role: 'user', content: contextualMessage }
    ];

    const response = await client.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages
    });

    const reply = response.content?.[0]?.text || 'Sorry, I could not generate a response.';
    res.json({ reply });
  } catch (err) {
    console.error('Advisor error:', err.message);
    res.status(500).json({ error: 'AI service unavailable. Check ANTHROPIC_API_KEY.' });
  }
});

module.exports = router;
