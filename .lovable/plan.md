

## Fix: Sidebar showing only 4 accounts instead of 20+

### Problem

`loadData` in `src/pages/Index.tsx` calls `DataService.fetchAccounts()` separately, which queries `transactions.select('account')` without pagination. The 1000-row Supabase limit means it only sees accounts from the first 1000 transactions, missing most accounts.

### Fix

**File:** `src/pages/Index.tsx`, lines 89-103

Replace the `loadData` function to derive accounts directly from the already-paginated transactions result instead of making a separate unpaginated query:

```typescript
const loadData = useCallback(async () => {
  setTxLoading(true);
  try {
    const txs = await DataService.fetchTransactions();
    const accs = [...new Set(txs.map(t => t.account).filter(Boolean))].sort();
    setTransactions(txs);
    setAccounts(accs);
  } catch (e) {
    console.error('Failed to load data:', e);
  } finally {
    setTxLoading(false);
  }
}, []);
```

This works because `fetchTransactions` already paginates through all 92,571 rows. Extracting unique accounts from those rows guarantees completeness and saves one API call.

No other files are changed.

