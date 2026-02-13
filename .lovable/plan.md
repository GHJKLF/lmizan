

## Add "Sync Latest" / "Full Sync" split-button and update edge functions

### Overview
Replace the single "Sync All" button with a split-button dropdown offering two modes:
- **Sync Latest** (default, fast): fetches only recent transactions (from last_synced_at, or last 90 days if first sync)
- **Full Sync** (historical, slow): fetches complete history

### Changes

**File 1: `src/pages/Index.tsx`** -- UI and handler changes

1. Add `ChevronDown` to lucide-react imports
2. Add `syncMenuOpen` state and a ref for click-outside handling
3. Update `handleSyncAll` signature to `async (fullSync: boolean = false)`
4. Update the three edge function invocations to pass `full_sync: fullSync` in the body:
   - Wise: replace `{ wise_connection_id: conn.id, days_back: 90 }` with `{ wise_connection_id: conn.id, full_sync: fullSync }`
   - PayPal: replace `{ connection_id: conn.id }` with `{ connection_id: conn.id, full_sync: fullSync }`
   - Stripe: replace `{ connection_id: conn.id }` with `{ connection_id: conn.id, full_sync: fullSync }`
5. Replace the single "Sync All" button (lines 203-210) with a split-button:
   - Left part: "Sync Latest" button that calls `handleSyncAll(false)`
   - Right part: small chevron-down button that toggles a dropdown
   - Dropdown contains one item: "Full Sync" that calls `handleSyncAll(true)`
   - Click-outside closes the dropdown
   - Both parts disabled while syncing; spinner shown on left part

**File 2: `supabase/functions/wise-sync/index.ts`** -- 90-day default for quick sync

Lines 153-157 currently default to `"2020-01-01"` when there's no `last_synced_at`. Change to default to 90 days back when `full_sync` is false:

```
const intervalStart = full_sync
  ? "2020-01-01T00:00:00.000Z"
  : conn.last_synced_at
    ? new Date(conn.last_synced_at).toISOString()
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
```

**File 3: `supabase/functions/paypal-sync/index.ts`** -- Add full_sync parameter

1. Change body parsing to: `const { connection_id, full_sync } = await req.json();`
2. Replace the intervalStart calculation:

```
const intervalStart = full_sync
  ? new Date(Date.now() - (2 * 365 + 335) * 24 * 60 * 60 * 1000).toISOString()
  : conn.last_synced_at
    ? new Date(conn.last_synced_at).toISOString()
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
```

**File 4: `supabase/functions/stripe-sync/index.ts`** -- Add full_sync parameter

1. Change body parsing to: `const { connection_id, full_sync } = await req.json();`
2. Replace `const lastSyncedAt = conn.last_synced_at;` with:

```
const lastSyncedAt = full_sync ? null : conn.last_synced_at;
const effectiveLastSynced = lastSyncedAt || (!full_sync ? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() : null);
```

3. Update the URL-building logic to use `effectiveLastSynced` instead of `lastSyncedAt` for the `created[gte]` filter

### Behavior summary

| Scenario | Wise | PayPal | Stripe |
|----------|------|--------|--------|
| Sync Latest (has last_synced_at) | From last_synced_at | From last_synced_at | From last_synced_at |
| Sync Latest (first sync) | Last 90 days | Last 90 days | Last 90 days |
| Full Sync | From 2020-01-01 | ~3 years back | All history |
