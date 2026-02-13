

## Fix: Transactions and AI Insights views show empty when account is selected

### Problem
When a specific account is selected in the sidebar, the Transactions tab shows "0 records" and AI Insights has no data. This happens because both views always receive the global `transactions` state (which is empty until the slow 92k-row fetch completes), ignoring the already-loaded `accountTransactions`.

### Solution
Three surgical changes in `src/pages/Index.tsx` only -- no other files modified.

### Change 1: Conditional lazy-load trigger (lines 145-149)
Only call `loadTransactions()` when `selectedAccount === 'ALL'`. When a specific account is selected, the existing account-level useEffect already handles loading.

```typescript
// Before
useEffect(() => {
  if (currentView === 'TRANSACTIONS' || currentView === 'AI_INSIGHTS') {
    loadTransactions();
  }
}, [currentView, loadTransactions]);

// After
useEffect(() => {
  if ((currentView === 'TRANSACTIONS' || currentView === 'AI_INSIGHTS') && selectedAccount === 'ALL') {
    loadTransactions();
  }
}, [currentView, selectedAccount, loadTransactions]);
```

### Change 2: TransactionTable data source (lines 245-251)
Pass `accountTransactions` when a specific account is selected, and scope the refresh handler accordingly.

```typescript
<TransactionTable
  transactions={selectedAccount !== 'ALL' ? accountTransactions : transactions}
  selectedAccount={selectedAccount}
  onRefresh={async () => {
    if (selectedAccount !== 'ALL') {
      await loadAccountTransactions(selectedAccount);
    } else {
      txLoadedRef.current = false;
      await loadTransactions();
    }
  }}
/>
```

### Change 3: AIInsightsView data source (lines 253-255)
Same pattern -- pass filtered data when an account is selected.

```typescript
<AIInsightsView transactions={selectedAccount !== 'ALL' ? accountTransactions : transactions} />
```

### Result
All three views (Dashboard, Transactions, AI Insights) correctly use `accountTransactions` when an account is selected and `transactions` when viewing ALL. No changes to child components.
