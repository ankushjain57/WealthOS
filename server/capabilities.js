/**
 * WealthOS AI Advisor — canonical capability definitions.
 * Single source of truth used by the system prompt, the agentic loop,
 * and the GET /api/advisor/capabilities endpoint.
 */

const CAPABILITIES = {
  canDo: [
    { action: 'add_holding',             description: 'Add a new holding (ticker, shares, price)' },
    { action: 'update_holding',          description: 'Update an existing holding\'s shares and/or price' },
    { action: 'delete_holding',          description: 'Delete a holding from the portfolio' },
    { action: 'add_account',             description: 'Add a new account (institution, balance, tax bucket, account type)' },
    { action: 'delete_account',          description: 'Delete an account' },
    { action: 'set_target_allocation',   description: 'Set a target allocation percentage for a ticker (for rebalancing)' },
    { action: 'compute_rebalance_plan',  description: 'Compute a rebalancing plan showing BUY/SELL trades to reach target allocations' },
    { action: 'execute_rebalance_trades', description: 'Execute the rebalancing plan, updating share counts to match targets' },
    { action: 'search_financial_news',   description: 'Search Yahoo Finance for real-time news and analyst commentary on any ticker or market theme' },
    { action: 'get_market_data',         description: 'Fetch live price, P/E, analyst target, 52-week range, and dividend yield for any ticker' },
  ],

  cannotDo: [
    { reason: 'vesting_schedules',  description: 'Store or track vesting schedules for RSUs or stock options' },
    { reason: 'rsu_flags',          description: 'Flag or tag holdings as RSUs, grants, or equity compensation' },
    { reason: 'lot_level_basis',    description: 'Record lot-level cost basis, acquisition dates, or tax lots' },
    { reason: 'options_metadata',   description: 'Track options contracts, expiry dates, or strike prices' },
    { reason: 'custom_metadata',    description: 'Store dividend reinvestment history or custom metadata on holdings' },
  ],

  /** Build the capability section injected into the Claude system prompt. */
  toSystemPromptSection() {
    const canLines   = this.canDo.map(c => `- ${c.description}`).join('\n');
    const cantLines  = this.cannotDo.map(c => `- ${c.description}`).join('\n');
    return `CAPABILITY BOUNDARIES — always be transparent about these when relevant:

**What I can do:**
${canLines}

**What I cannot do:**
${cantLines}

The database schema does not have fields for the items above. If the user requests an unsupported action, explicitly state what you can and cannot do using the exact headings above, explain why the schema does not support it, and offer the closest supported alternative.`;
  },
};

module.exports = CAPABILITIES;
