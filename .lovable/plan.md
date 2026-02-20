

## Fix: Two Stripe Ecozahar Issues

### Issue 1: Missing History (only synced from Sep 2024)

**Root cause:** When `stripe-sync` is called without `full_sync`, it defaults to a 90-day lookback window (`Date.now() - 90 days`). When `full_sync` is true, it sets `effectiveLastSynced = null` (no `created[gte]` filter), which fetches everything. The backfill phase (Phase 2) should catch older transactions, but it depends on existing transactions being present first.

The real problem: the first sync only grabbed 90 days, and then backfill works backwards from the oldest existing record. But if the initial sync was triggered without `full_sync`, it starts from ~90 days ago. Subsequent syncs use `last_synced_at` and only go forward.

**Fix:** Add an optional `start_date` body parameter to `stripe-sync/index.ts`. When provided, it overrides both the `last_synced_at` and the 90-day fallback, using the caller's date as the `created[gte]` floor.

**File: `supabase/functions/stripe-sync/index.ts`**
- Parse `start_date` from the request body alongside `connection_id` and `full_sync`
- When `start_date` is provided, use it as the effective start (converted to Unix timestamp for `created[gte]`)
- Priority: `start_date` > `full_sync` > `last_synced_at` > 90-day fallback

**File: `src/pages/Settings.tsx`**
- Add a "Full Historical Sync" button or option next to the existing Stripe sync button
- When clicked, call `stripe-sync` with `{ connection_id, start_date: "2020-01-01" }` to fetch all history from day 1

**File: `src/components/StripeConnectionWizard.tsx`**
- On initial connection, pass `full_sync: true` so the first sync grabs everything rather than just 90 days

### Issue 2: Wrong Balance (reserved funds inflating/deflating balance)

**Root cause:** Stripe "reserved funds" transactions (descriptions like "Reserve", "Reserved Funds", "Scheduled release of reserved funds") are internal holds, not real business inflows/outflows. They're currently classified as Inflow/Outflow, which skews the balance.

**Fix 1: Update `mapType` in `stripe-sync/index.ts`**
- Add reserved funds detection: if the description matches reserve-related patterns, set type = "Transfer"
- Patterns to match (case-insensitive): `reserve`, `reserved funds`, `scheduled release of reserved funds`

**Fix 2: Same update in `process-sync-chunk/index.ts`**
- The Stripe mapping logic on line 185 already handles `payout` as Transfer
- Add the same reserved funds description check

**Fix 3: Data migration for existing records**
- Run an UPDATE query to reclassify existing reserved funds transactions as Transfer type:
```sql
UPDATE transactions 
SET type = 'Transfer' 
WHERE account = 'Stripe Ecozahar' 
  AND (
    description ILIKE '%reserve%' 
    OR description ILIKE '%Reserved Funds%' 
    OR description ILIKE '%Scheduled release of reserved funds%'
  );
```

### Summary of changes

| File | Change |
|------|--------|
| `supabase/functions/stripe-sync/index.ts` | Add `start_date` parameter support; add reserved funds -> Transfer mapping in `mapType` |
| `supabase/functions/process-sync-chunk/index.ts` | Add reserved funds -> Transfer mapping for Stripe transactions |
| `src/pages/Settings.tsx` | Add "Full Historical Sync" option for Stripe connections |
| `src/components/StripeConnectionWizard.tsx` | Pass `full_sync: true` on initial connection |
| Database (data update) | Reclassify existing reserved funds transactions as Transfer |

### Technical Detail

**`stripe-sync/index.ts` changes:**
```text
1. Parse { connection_id, full_sync, start_date } from request body
2. Compute effectiveLastSynced:
   - If start_date provided: use start_date
   - Else if full_sync: null (no filter, fetch all)
   - Else if last_synced_at: use last_synced_at  
   - Else: 90-day fallback
3. Update mapType(txType, net, description):
   - payout -> Transfer
   - description matches /reserve/i -> Transfer
   - Otherwise: net >= 0 ? Inflow : Outflow
```

**No database schema changes needed** -- the `type` column is already a text field and "Transfer" is already a supported value.
