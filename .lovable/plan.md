

## Fix: Account drill-down loading all 92k transactions

### Problem
Clicking an individual account in the sidebar triggers `loadTransactions()` which fetches ALL 92,000+ transactions. The account dashboard shows a spinner until all data loads (60-90 seconds).

### Solution
Add a filtered fetch method that only retrieves transactions for the selected account (typically 500-5,000 rows), and use separate state for account-specific transactions.

### Changes

**File 1: `src/services/dataService.ts`**

Add `fetchAccountTransactions(account: string)` method after `fetchTransactions()`. This method:
- Filters by `.eq('account', account)` 
- Orders by date descending
- Uses 5,000-row batches (accounts rarely exceed this)
- Maps rows to `Transaction` objects using the same mapping as `fetchTransactions()`

**File 2: `src/pages/Index.tsx`**

Three targeted changes:

1. Add new state variables:
   - `accountTransactions: Transaction[]` -- holds only the selected account's transactions
   - `accountTxLoading: boolean` -- loading state for account drill-down

2. Add `loadAccountTransactions(account)` callback that calls `DataService.fetchAccountTransactions()` and sets `accountTransactions` state

3. Replace the useEffect at lines 137-141 (which calls `loadTransactions()` on account change) to instead call `loadAccountTransactions(selectedAccount)` and clear state when returning to ALL

4. Update Dashboard props to pass `accountTransactions` and `accountTxLoading` instead of the global `transactions`/`txLoading` for the drill-down view:
   ```
   <Dashboard
     dashboardData={dashboardData}
     transactions={accountTransactions}   // was: transactions
     selectedAccount={selectedAccount}
     onSelectAccount={setSelectedAccount}
     loading={dashboardLoading}
     txLoading={accountTxLoading}          // was: txLoading
   />
   ```

The existing `loadTransactions()` and its useEffect for TRANSACTIONS/AI_INSIGHTS views remain unchanged.

### Result
Account drill-down loads in 1-3 seconds instead of 60-90 seconds.
