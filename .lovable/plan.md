

## Fix: Sidebar showing counterparty names instead of real accounts

### Problem

The sidebar currently derives accounts from the `account` column in the `transactions` table, which contains counterparty names (e.g., "Akai Sushi TANGER") mixed with real financial accounts. The database has a dedicated `accounts` table with the correct 22 real accounts.

### Fix

**File:** `src/pages/Index.tsx`, `loadData` function (lines 89-100)

Replace the account derivation logic to query the `accounts` table directly instead of extracting from transactions:

```typescript
const [txs, accsResult] = await Promise.all([
  DataService.fetchTransactions(),
  supabase.from('accounts').select('name'),
]);
const accs = (accsResult.data || []).map((r: any) => r.name as string).filter(Boolean).sort();
```

`supabase` is already imported in this file. The `accounts` table has RLS policies scoped to `auth.uid() = user_id`, so it will return only the current user's accounts.

No other files are changed.

