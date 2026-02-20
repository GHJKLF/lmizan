

## Fix Stripe Balance: Include Transfers in Balance Formula

### Problem
Stripe Ecozahar shows EUR 1,034,653 balance. The actual Stripe balance is ~EUR 212. The current formula `Inflow - Outflow` ignores Transfer transactions (payouts, reserved funds), which represent money leaving Stripe. The correct formula is `Inflow - Outflow - Transfers`.

Proof: 1,049,096 (Inflow) - 14,443 (Outflow) - 1,034,441 (Transfers) = 212 EUR

### Changes

#### 1. Database RPC: `get_account_balances` (migration)
Update the `computed_balances` CTE to subtract Transfer amounts:
```sql
SUM(CASE 
  WHEN t.type = 'Inflow' THEN t.amount 
  WHEN t.type = 'Outflow' THEN -t.amount 
  WHEN t.type = 'Transfer' THEN -t.amount 
  ELSE 0 
END) AS running_balance
```

#### 2. Client-side fallback: `src/services/balanceEngine.ts`
In `computeAccountSummaries`, change the fallback balance computation (around line 100-104) from skipping Transfers to subtracting them:
```text
Current:  if (tx.type === 'Transfer') return;
New:      if (tx.type === 'Transfer') { total -= tx.amount; return; }
```

#### 3. Account Detail UI: `src/components/dashboard/AccountDashboard.tsx`
Add computed stats for the account detail page:
- Compute `netRevenueProcessed = totalInflow - totalOutflow` (the cumulative revenue that flowed through the processor)
- Compute `actualBalance = totalInflow - totalOutflow - transferVolume`
- Update the Balance card to show `actualBalance` (Inflow - Outflow - Transfers)
- Keep the existing Transfers card showing pass-through volume
- Add a "Net Revenue Processed" card showing Inflow - Outflow
- Add a reconciliation line: "Balance check: Inflow - Outflow - Transfers = X"

### Files Modified

| File | Change |
|------|--------|
| `get_account_balances` RPC (SQL migration) | Subtract Transfer amounts in computed_balances CTE |
| `src/services/balanceEngine.ts` | Subtract Transfers in fallback balance computation |
| `src/components/dashboard/AccountDashboard.tsx` | Add Net Revenue Processed card, reconciliation check, update Balance card |

### What stays the same
- Monthly cash flow calculations (already exclude Transfers)
- Equity trend (already excludes Transfers -- this may need revisiting separately)
- Transaction list display (Inflow/Outflow/Transfer labels unchanged)
- Accounts with `running_balance` set (e.g., Wise) are unaffected
