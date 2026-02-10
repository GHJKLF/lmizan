
# Fix 3 Remaining Bugs

## Bug 1: created_at tiebreaker for balance sorting

When multiple transactions share the same date, the sort order is arbitrary. This causes incorrect balance snapshots -- the system may pick an older balance row instead of the latest correction. Adding `created_at` as a secondary sort key ensures the most recently inserted row wins.

**Changes:**

1. **src/types/index.ts** -- Add `createdAt?: string` to the `Transaction` interface (after `balanceReserved`).

2. **src/services/dataService.ts** (line 92) -- Add `createdAt: row.created_at,` to the mapping object inside `fetchTransactions()`.

3. **src/services/balanceEngine.ts** (line 57) -- Replace the simple date sort with a two-level sort:
   - Primary: date descending
   - Secondary: `createdAt` descending (later `created_at` wins for same-date transactions)

## Bug 2: Wrong account names in sidebar

`fetchAccounts()` currently merges three sources (hardcoded ACCOUNTS constant, accounts DB table, localStorage), producing phantom accounts that have no transactions.

**Changes:**

1. **src/services/dataService.ts** (lines 96-102) -- Replace the entire `fetchAccounts()` body with a single query: `SELECT DISTINCT account FROM transactions ORDER BY account`. This ensures only accounts that actually have transaction data appear in the sidebar.

## Bug 3: Account detail shows single combined balance instead of per-currency breakdown

Currently, `Dashboard.tsx` passes a single `summary` to `AccountDashboard`. But since summaries are now keyed by `account-currency` pair (e.g., `"Wise Grunkauf-EUR"`), `summaries.find(s => s.account === selectedAccount)` no longer matches because `s.account` is `"Wise Grunkauf-EUR"`.

**Changes:**

1. **src/services/balanceEngine.ts** (line 84) -- Store the original account name (without currency suffix) in the summary. Currently `account` is set from the map key which is `"AccountName-Currency"`. Change to store the original `latest.account` so `summary.account` remains the clean account name (e.g., `"Wise Grunkauf"`).

2. **src/components/dashboard/Dashboard.tsx** (lines 39-48) -- Instead of passing a single `summary`, filter all summaries matching `selectedAccount` and pass the array. Change `AccountDashboard` props from `summary: AccountSummary | undefined` to `summaries: AccountSummary[]`.

3. **src/components/dashboard/AccountDashboard.tsx** -- Update the component to:
   - Accept `summaries: AccountSummary[]` instead of `summary: AccountSummary | undefined`
   - Render one balance card group per currency (each showing Balance, Available, Reserved in its native currency)
   - Display currency label (e.g., "EUR LIQUIDITY", "USD LIQUIDITY") as a header for each group

## Technical Details

| Bug | Files Modified | Key Change |
|-----|---------------|------------|
| 1 | types/index.ts, dataService.ts, balanceEngine.ts | Add createdAt field + secondary sort |
| 2 | dataService.ts | Replace fetchAccounts with DISTINCT query on transactions |
| 3 | balanceEngine.ts, Dashboard.tsx, AccountDashboard.tsx | Store clean account name in summaries, pass array of summaries, render per-currency cards |
