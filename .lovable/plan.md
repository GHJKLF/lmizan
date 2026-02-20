

## Redesign Airwallex to Multi-Currency Wallet

### Overview
Restructure the Airwallex integration from single-currency-per-connection (like Wise) to multi-currency wallet (one connection = all currencies). This requires a DB migration, edge function rewrite, and Settings UI update.

### Part 1 -- Database Migration

**New migration file** with these changes:

1. Drop `currency`, `balance_available`, `balance_fetched_at` columns from `airwallex_connections`
2. Create `airwallex_balances` table with columns: `id`, `connection_id` (FK to airwallex_connections), `currency`, `available_amount`, `pending_amount`, `total_amount`, `synced_at`, with a UNIQUE constraint on `(connection_id, currency)`
3. Enable RLS on `airwallex_balances` with a policy that checks ownership via the parent `airwallex_connections` table
4. Update `airwallex_connections_safe` view to remove the dropped columns
5. Update `get_airwallex_connection_with_key` RPC to remove `currency` from return type

### Part 2 -- Edge Function Update

**File:** `supabase/functions/airwallex-sync/index.ts`

Changes:
- Remove `conn.currency` fallback from transaction currency mapping (use `t.currency` as-is, default to "EUR" only if missing)
- Replace the single-currency balance logic (Step 5) with multi-currency upsert:
  - Fetch ALL balances from `/api/v1/balances/current`
  - Upsert each balance into `airwallex_balances` with `onConflict: 'connection_id,currency'`
- Return `{ synced: N, currencies: [...] }` instead of just `{ synced: N }`

### Part 3 -- Settings UI Update

**File:** `src/pages/Settings.tsx`

Interface changes:
- Remove `currency`, `balance_available`, `balance_fetched_at` from `AirwallexConnection`
- Add new `AirwallexBalance` interface with `currency`, `available_amount`, `pending_amount`, `total_amount`, `synced_at`

State changes:
- Remove `currency` from `airwallexForm` state
- Add `airwallexBalances` state as `Record<string, AirwallexBalance[]>` keyed by connection_id
- In `loadData()`, fetch from `airwallex_balances` table and group by connection_id

Form changes:
- Remove Currency input field from the add connection form
- Remove `currency` from the insert call in `handleAirwallexAdd`

Connection card UI changes:
- Replace single currency badge + single balance with a flex-wrap grid of currency chips
- Each chip shows: currency symbol + formatted amount (e.g., `EUR euro60,782`, `USD $7.00`)
- Currency symbol map: EUR=euro, USD=$, GBP=pound, HKD=HK$, SGD=S$, AUD=A$, CNY=yen, JPY=yen, CHF=CHF, others show 3-letter code
- If no balances exist for a connection, show "Sync to see balances" in muted text

### Technical Details

| File | Change |
|------|--------|
| New migration SQL | Drop columns, create airwallex_balances, update view + RPC |
| `supabase/functions/airwallex-sync/index.ts` | Multi-currency balance upsert, remove single-currency logic |
| `src/pages/Settings.tsx` | Update interfaces, state, form, and card UI |

No changes needed in `src/pages/Index.tsx` -- the `handleSyncAll` call already passes `connection_id` without currency, so it works as-is.

