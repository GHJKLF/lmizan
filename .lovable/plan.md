

## Phase 5: Equity / Balance Sheet Dashboard

### Overview
Add a new "Equity" page accessible from the sidebar, providing a full balance-sheet view with Total Assets, Liabilities (VAT + Disputes), Net Worth, and an asset breakdown table.

### Changes

#### 1. Add `EQUITY` to ViewState type
**File:** `src/types/index.ts`
- Add `'EQUITY'` to the `ViewState` union type

#### 2. Create Equity page component
**File:** `src/components/equity/EquityDashboard.tsx` (new)

Three sections:

**Section 1 - Balance Sheet Summary (4 cards row)**
- Total Assets: sum of all account balance_eur from dashboardData.accountBalances
- Total Liabilities: VAT Payable + Disputes Reserve (fetched via useQuery)
- Net Worth: Assets minus Liabilities
- Liabilities/Assets ratio: percentage

**Section 2 - Liabilities Breakdown (2 cards side by side)**
- Card A: VAT Payable - useQuery fetching sum of EUR inflow transactions from last 12 months, multiply by 0.21
- Card B: Disputes Reserve - useQuery fetching outflow transactions where description matches dispute/chargeback/reversal patterns, last 12 months

**Section 3 - Asset Breakdown Table**
- Reuse accountBalances from dashboardData
- Table columns: Account, Currency, Balance (native), Balance (EUR), % of Total, Tier
- Sorted by EUR balance descending

Data fetching approach:
- Account balances: passed as prop from Index.tsx (dashboardData.accountBalances)
- VAT and disputes: two separate useQuery hooks with direct Supabase queries on the transactions table

#### 3. Add sidebar nav item
**File:** `src/components/AppSidebar.tsx`
- Add "Equity" nav item with `Scale` icon between P&L and Transactions
- Wire to `onNavigate('EQUITY')`

#### 4. Add Equity view rendering in Index
**File:** `src/pages/Index.tsx`
- Add conditional rendering for `currentView === 'EQUITY'`
- Pass `dashboardData` to EquityDashboard

#### 5. Styling
- Match existing dark card style from Dashboard/LiquidityHeader
- Use Card/CardContent components, same typography and spacing
- Use `formatEUR` helper from balanceEngine

### Technical Details

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `'EQUITY'` to ViewState union |
| `src/components/equity/EquityDashboard.tsx` | New component with 3 sections |
| `src/components/AppSidebar.tsx` | Add Equity nav item with Scale icon |
| `src/pages/Index.tsx` | Render EquityDashboard when view is EQUITY |

**Supabase queries for liabilities:**

VAT query:
```sql
SELECT COALESCE(SUM(amount), 0) as total
FROM transactions
WHERE user_id = auth.uid()
  AND type = 'Inflow'
  AND currency = 'EUR'
  AND date >= (CURRENT_DATE - INTERVAL '12 months')
```

Disputes query:
```sql
SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
FROM transactions
WHERE user_id = auth.uid()
  AND type = 'Outflow'
  AND date >= (CURRENT_DATE - INTERVAL '12 months')
  AND (LOWER(description) LIKE '%dispute%'
    OR LOWER(description) LIKE '%chargeback%'
    OR LOWER(description) LIKE '%reversal%')
```

Both queries will use the Supabase JS client with `.select()` and filters, or `.rpc()` if needed. Since Supabase JS filters don't support OR on LIKE patterns easily, we'll use two approaches:
- VAT: straightforward `.from('transactions').select('amount').eq('type','Inflow').eq('currency','EUR').gte('date', cutoffDate)` then sum client-side
- Disputes: fetch with `.or('description.ilike.%dispute%,description.ilike.%chargeback%,description.ilike.%reversal%')` filter then sum client-side

No database migrations or new RPC functions needed.

