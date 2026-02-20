

## Fix: Account Balances Chart Using Stripe API Balance

### Problem
The `get_account_balances` RPC function computes Stripe account balances as `Inflow - Outflow` from transactions, producing ~EUR 1M+. The Stripe API balance (EUR 213) is already stored in `stripe_connections.balance_available` and `balance_pending` but the RPC doesn't use it.

### Solution
Update the `get_account_balances` SQL function to add a new CTE that checks `stripe_connections` for accounts with a non-null `balance_fetched_at`. When a match is found, use `balance_available + balance_pending` instead of the transaction-computed sum.

### Technical Detail

**File: New SQL migration**

Add a `stripe_api_balances` CTE that joins `accounts` to `stripe_connections` on `account_name` and `user_id`, selecting rows where `balance_fetched_at IS NOT NULL`. Then in the final `latest` UNION, prioritize `stripe_api_balances` over `computed_balances` by excluding accounts that have a Stripe API balance from the computed path.

```text
Flow:
1. latest_with_rb      -- accounts with running_balance in transactions (Wise)
2. stripe_api_balances -- accounts matching stripe_connections with fetched balance
3. computed_balances   -- remaining accounts (Inflow - Outflow), excluding those already covered
4. latest = UNION ALL of all three
```

The stripe CTE will produce rows with:
- `running_balance = balance_available + balance_pending`
- `balance_available = sc.balance_available`
- `balance_reserved = sc.balance_pending`
- `currency` from `stripe_connections.currency`

No other files are changed. This only affects the chart data source via the RPC.

### Files Modified

| File | Change |
|------|--------|
| New SQL migration | Update `get_account_balances` RPC to use Stripe API balances when available |

