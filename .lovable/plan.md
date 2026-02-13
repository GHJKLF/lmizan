

## Performance Fix: Two-Phase Lazy Loading for Dashboard

### Problem
The dashboard takes 60-90 seconds to load because it fetches all 92,000+ transactions (93 sequential API calls) just to compute aggregate metrics. The dashboard only needs summaries, not individual rows.

### Solution Overview
Move aggregation logic to the database via SQL functions (RPCs), and only fetch raw transactions when the user navigates to the Transactions view.

---

### Phase 1: Create 3 Database Functions (Migration)

**1. `get_account_balances()`** -- Returns latest balance per account-currency pair

Uses the same logic as `computeAccountSummaries`: for each account-currency pair, find the most recent transaction (by date desc, created_at desc), return its running_balance, balance_available, balance_reserved, plus a tier classification based on account name keywords. Also includes FX conversion to EUR using hardcoded rates matching `constants/index.ts`.

Returns columns: account, currency, total, available, reserved, tier, balance_eur, last_updated

**2. `get_equity_trend()`** -- Returns daily cumulative equity in EUR

Replicates `computeEquityTrend`: sorts all transactions by date, computes a running EUR sum (inflows add, outflows subtract), returns one row per day.

Returns columns: date, equity

**3. `get_monthly_cash_flow()`** -- Returns monthly inflow/outflow/net in EUR

Replicates `computeMonthlyFlows`: groups transactions by month (YYYY-MM), sums EUR-converted amounts by type.

Returns columns: month, inflow, outflow, net

All three functions filter by `auth.uid() = user_id` for security.

---

### Phase 2: New Data Service Method

Add `DataService.fetchDashboardData()` that calls all 3 RPCs in parallel via `Promise.all` and returns a typed `DashboardData` object.

---

### Phase 3: New Types

Create a `DashboardData` interface containing:
- `accountBalances` (from RPC 1, used by LiquidityHeader, AccountBreakdown)
- `equityTrend` (from RPC 2, used by EquityTrendChart)
- `monthlyFlows` (from RPC 3, used by CashFlowWaterfall)
- Computed `liquiditySnapshot` (derived client-side from accountBalances -- simple sum, fast)

---

### Phase 4: Refactor Index.tsx -- Two-Phase Loading

- Add `dashboardData` state (separate from `transactions`)
- On initial load and DASHBOARD view: fetch `dashboardData` + accounts (fast, under 3s)
- On TRANSACTIONS/AI_INSIGHTS view navigation: fetch full `transactions` lazily (only when needed, only once)
- Pass `dashboardData` to Dashboard instead of `transactions[]`
- Transactions, ImportModal, UpdateBalanceModal, PayoutReconciler, AIInsights continue receiving `transactions` (loaded on demand)

---

### Phase 5: Refactor Dashboard.tsx

- Accept `DashboardData` prop instead of `Transaction[]`
- Remove all `useMemo` compute calls (data is pre-computed)
- Pass pre-computed data directly to child components
- AccountDashboard (single-account drill-down) will need transactions -- trigger lazy load when user clicks an account

---

### Files Changed

| File | Change |
|------|--------|
| Migration SQL | Create 3 RPC functions |
| `src/types/index.ts` | Add `DashboardData` interface |
| `src/services/dataService.ts` | Add `fetchDashboardData()` method |
| `src/pages/Index.tsx` | Two-phase loading logic, separate state |
| `src/components/dashboard/Dashboard.tsx` | Accept `DashboardData` prop |

### Technical Details: SQL Functions

The FX rates will be hardcoded in SQL matching the constants file. Currencies include: EUR (1.0), USD (0.92), MAD (0.092), GBP (1.17), ILS (0.25), DKK (0.134), SEK (0.088), HKD (0.12), CAD (0.67), AUD (0.60), CHF (1.05), PLN (0.23), NZD (0.55), CNY (0.13), AED (0.25).

The `get_account_balances` function uses a `DISTINCT ON (account, upper(currency))` query sorted by date desc, created_at desc to get the latest transaction per account-currency pair. Tier classification uses `CASE WHEN` with the same keyword matching as the TypeScript `classifyTier` function.

The `get_equity_trend` function uses a window function `SUM() OVER (ORDER BY date)` on EUR-converted amounts (positive for Inflow, negative for Outflow), grouped by date.

The `get_monthly_cash_flow` function groups by `to_char(date, 'YYYY-MM')` and sums EUR-converted amounts split by type.

### Expected Result
Dashboard loads in under 3 seconds (3 lightweight SQL queries vs 93 paginated API calls). Transactions page still works fully when navigated to.

