

## Fix: Infinite Loading for Accounts with No Transactions

### Problem
When selecting an account that has no transactions (e.g., "PayPal Porteparis" after a fresh connection), the dashboard shows a spinner forever. This happens because of a faulty condition in `Dashboard.tsx` line 86:

```typescript
if (txLoading || transactions.length === 0) {
  return <Loader2 spinner />
}
```

When loading finishes (`txLoading = false`) but the account has zero transactions (`transactions.length === 0`), the spinner persists indefinitely.

### Fix

**File: `src/components/dashboard/Dashboard.tsx` (line 85-92)**

Change the loading guard to only check `txLoading`, and handle the "no transactions" case separately with a proper empty state:

```typescript
if (selectedAccount !== 'ALL') {
  if (txLoading) {
    return <Loader2 spinner />;
  }
  return (
    <AccountDashboard
      account={selectedAccount}
      summaries={accountSummaries}
      transactions={transactions}
      onBack={() => onSelectAccount('ALL')}
    />
  );
}
```

This allows `AccountDashboard` to render even with zero transactions -- it already handles the empty state gracefully (shows "No transactions found" in the recent transactions section, and empty charts).

### Scope
- Single file change: `src/components/dashboard/Dashboard.tsx`
- Remove the `transactions.length === 0` condition from the loading guard on line 86
- No database or backend changes needed
