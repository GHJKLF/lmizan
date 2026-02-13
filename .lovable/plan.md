

## Fix fetchTransactions() pagination — only 5,000 of 92,571 transactions loading

### Problem

Line 60 of `src/services/dataService.ts` passes `{ count: undefined as any }` to Supabase's `.select()` on the second batch onwards. This is an invalid option that causes silent query failure, breaking pagination after the first 5,000 rows.

### Fix

Replace the `fetchTransactions` method (lines 51-97) with a simplified version that:

1. Uses plain `.select('*')` with no count options at all
2. Removes the `totalCount` variable entirely
3. Relies only on `data.length < batchSize` or empty results to stop the loop
4. Keeps `.range()` pagination which works correctly
5. Preserves existing field mapping (notes, runningBalance, balanceAvailable, balanceReserved, createdAt)

### Technical Details

**File:** `src/services/dataService.ts`, lines 51-97

```typescript
// BEFORE (broken):
.select('*', from === 0 ? { count: 'exact' } : { count: undefined as any })

// AFTER (fixed):
.select('*')
```

The full replacement removes `totalCount`, the conditional count logic, and the `totalCount`-based break condition. The loop terminates when a batch returns fewer than 5,000 rows or returns empty/error.

No other files are affected.
