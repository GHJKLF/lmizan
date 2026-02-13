

## Fix fetchTransactions() batch size to match database row limit

### Problem

The `batchSize` is set to 5000, but the database returns a maximum of 1000 rows per request. When the first batch returns 1000 rows (less than 5000), the loop termination condition `data.length < batchSize` fires immediately, stopping after just one batch.

### Fix

**File:** `src/services/dataService.ts`, line 54

Change:
```typescript
const batchSize = 5000;
```
To:
```typescript
const batchSize = 1000;
```

This is the only change needed. The loop will now correctly paginate through all 92,571 transactions in ~93 batches of 1000 rows each.

