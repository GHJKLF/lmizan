

## Fix Stripe Balance: Show API Balance Instead of Computed

### Problem
Transaction-based balance (Inflow - Outflow) shows €1,034,653 which is wrong. Including Transfers (Inflow - Outflow - Transfers) gives -€207,749 due to asymmetric historical data. The real balance must come from Stripe's /v1/balance API.

### Solution Implemented

#### 1. Balance formula reverted (RPC + balanceEngine.ts)
- `computed_balances` CTE: `Inflow - Outflow` (Transfers excluded, as before)
- `balanceEngine.ts` fallback: `if (tx.type === 'Transfer') return;`

#### 2. Stripe API balance stored in `stripe_connections`
- Added columns: `balance_available`, `balance_pending`, `balance_fetched_at`
- `stripe-sync` edge function now calls `GET /v1/balance` and stores the result

#### 3. AccountDashboard shows API balance for Stripe
- Balance card shows `balance_available + balance_pending` from `stripe_connections`
- Available/Pending shown as separate cards
- Falls back to transaction-computed balance if API balance not yet fetched
- Analytics section shows Net Revenue Processed and Total Transfers

### Next: Trigger a Stripe sync to populate the balance columns
