

## Fix: Equity Trend Chart Showing -4M Instead of +507K

### Problem
The `get_equity_trend()` RPC naively sums all Inflows minus Outflows across 173K transactions. But accounts like Wise and WorldFirst have `running_balance` on their transactions -- meaning the bank API already tracks the balance. Re-summing their flows double-counts withdrawals, producing a massively incorrect -4M equity line.

Meanwhile, `get_account_balances()` correctly uses `running_balance` for those accounts and shows the right total (~507K EUR).

### Solution
Rewrite `get_equity_trend(p_days)` as a single new SQL migration. The new logic:

1. **Generate a date spine** from `CURRENT_DATE - p_days` to `CURRENT_DATE` using `generate_series`
2. **Filter to real accounts only** -- exclude merchant counterparty names (like "Chourouk Market TANGER") by requiring accounts either match known financial institution patterns OR have 20+ transactions
3. **For each date, compute per-account balances using two strategies:**
   - **Running-balance accounts** (Wise, WorldFirst, CIH, CFG, etc.): Use `DISTINCT ON (account, currency)` ordered by `date DESC, created_at DESC` to get the latest `running_balance` on or before each date
   - **Computed accounts** (Stripe, PayPal, Airwallex -- no running_balance): Sum `Inflow - Outflow` for all transactions on or before each date (excluding Transfer type)
4. **For Airwallex**: Use `airwallex_balances` table for the current snapshot (only today's balance exists, so it will appear as a flat value for the most recent period)
5. **Convert to EUR** using the same hardcoded FX rates as all other RPCs
6. **Sum across all accounts per day** to get total equity

### What changes
- **One new migration**: `CREATE OR REPLACE FUNCTION public.get_equity_trend(p_days int DEFAULT 180)`

### What does NOT change
- `get_account_balances()` -- untouched
- `get_monthly_cash_flow()` -- untouched
- Any TypeScript/React files -- no UI changes
- Any other functions or edge functions

### Technical Details

The SQL function structure:

```text
WITH
  fx_rates AS (same hardcoded rates as other RPCs),

  date_spine AS (generate_series for p_days),

  real_accounts AS (
    -- accounts with 20+ txs OR matching known patterns
    SELECT DISTINCT account FROM transactions
    WHERE account matches known patterns
    OR account IN (SELECT account FROM transactions GROUP BY account HAVING count(*) >= 20)
  ),

  -- Strategy 1: running_balance accounts
  -- For each (date, account, currency), get the latest running_balance <= that date
  rb_daily AS (
    LATERAL join: for each date in spine, get DISTINCT ON (account, currency)
    the latest transaction with running_balance on or before that date
  ),

  -- Strategy 2: computed accounts (no running_balance anywhere)
  computed_daily AS (
    For each date in spine, cumulative SUM(Inflow - Outflow) up to that date
    for accounts that have zero running_balance transactions
  ),

  -- Strategy 3: Airwallex from balances table (current snapshot only)
  airwallex_bal AS (
    Latest non-zero balances from airwallex_balances joined to airwallex_connections
  ),

  -- Combine all, convert to EUR, sum per day
  combined AS (
    UNION ALL of rb_daily + computed_daily + airwallex_bal (for latest dates)
  )

SELECT date, ROUND(SUM(balance * fx_rate)) AS equity
FROM combined
GROUP BY date
ORDER BY date;
```

The final equity on today's date should approximately match `SUM(balance_eur)` from `get_account_balances()`.
