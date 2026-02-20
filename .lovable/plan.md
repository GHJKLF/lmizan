

## Fix Duplicate Transactions Across All Sync Functions

### Problem
All sync functions use `crypto.randomUUID()` for transaction IDs, meaning every sync run creates new rows instead of deduplicating. This caused 3-4x duplication across Wise and Stripe accounts, inflating P&L figures.

### Changes

### 1. `supabase/functions/wise-sync/index.ts`

**Statement path (lines 184-223):**
- Remove the `existingTxs` query and `existingRefs` Set construction (lines 184-197)
- Change `id: crypto.randomUUID()` to `id: "wise-" + refNumber` (line 208)
- Remove `_wise_ref` field from mapped objects
- Remove the `.filter()` call that uses `existingRefs` (line 223)
- Change `.insert(chunk)` to `.upsert(chunk, { onConflict: 'id', ignoreDuplicates: true })`

**Transfers path (lines 244-283):**
- Remove the `existingTxs` query and `existingIds` Set construction (lines 244-257)
- Change `id: crypto.randomUUID()` to `id: "wise-transfer-" + tr.id` (line 268)
- Remove `_wise_id` field from mapped objects
- Remove the `.filter()` call that uses `existingIds` (line 283)
- Same upsert change for insert

**Cleanup:** Remove the `_wise_id`/`_wise_ref` stripping from `payloads` map (line 288) since those fields no longer exist.

### 2. `supabase/functions/wise-webhook/index.ts`

- Change `id: crypto.randomUUID()` (line 112) to a deterministic ID: `id: "wise-wh-" + (data.transfer_reference || crypto.randomUUID())`
- Change `.insert(tx)` (line 126) to `.upsert(tx, { onConflict: 'id', ignoreDuplicates: true })`

### 3. `supabase/functions/stripe-sync/index.ts`

- Remove the entire `existingIds` preload loop (lines 82-100)
- Change `id: crypto.randomUUID()` to `id: "stripe-" + bt.id` in `mapBt()` (line 115)
- Remove `_stripe_id` field from `mapBt()` return
- In `insertPage()`: remove the `existingIds` filtering (line 134), remove `_stripe_id` stripping (line 137), change `.insert(chunk)` to `.upsert(chunk, { onConflict: 'id', ignoreDuplicates: true })`, remove the `existingIds.add()` tracking (lines 146-148)

### 4. `supabase/functions/process-sync-chunk/index.ts`

- Line 97: Change `ignoreDuplicates: false` to `ignoreDuplicates: true`

### 5. Database Migration: Deduplicate Existing Rows

Create a new migration that removes duplicate transactions, keeping only the earliest row per unique `(user_id, notes)`:

```sql
DELETE FROM transactions
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY user_id, notes
      ORDER BY created_at ASC
    ) AS rn
    FROM transactions
    WHERE notes IS NOT NULL AND notes != ''
  ) ranked
  WHERE rn > 1
);
```

### Technical Details

| File | Change Summary |
|------|---------------|
| `supabase/functions/wise-sync/index.ts` | Deterministic IDs (`wise-{ref}`), remove preload dedup, use upsert |
| `supabase/functions/wise-webhook/index.ts` | Deterministic ID, use upsert |
| `supabase/functions/stripe-sync/index.ts` | Deterministic IDs (`stripe-{bt.id}`), remove preload dedup, use upsert |
| `supabase/functions/process-sync-chunk/index.ts` | Set `ignoreDuplicates: true` |
| `supabase/migrations/[timestamp].sql` | Deduplicate existing rows |

