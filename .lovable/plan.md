

## Fix: Account transactions capped at 1000 records

### Problem
`fetchAccountTransactions` uses `batchSize = 5000`, but Supabase PostgREST caps responses at 1000 rows. The pagination loop exits early because `data.length (1000) < batchSize (5000)`, mistakenly thinking all data was fetched.

### Fix
One-line change in `src/services/dataService.ts`, line 125:

Change `const batchSize = 5000;` to `const batchSize = 1000;`

This aligns with the working `fetchTransactions` method and ensures the pagination loop correctly continues when exactly 1000 rows are returned.

