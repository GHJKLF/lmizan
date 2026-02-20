
## Full Airwallex Integration

### Overview
This implements a complete Airwallex integration in 4 coordinated parts: database schema, a sync edge function, a Settings UI section, and wiring into the global "Sync Latest" button. The implementation follows the exact same patterns as the existing Stripe, Wise, and PayPal integrations.

---

### Part 1 — Database Migration

**File:** New migration SQL file

Create the `airwallex_connections` table with the exact schema specified:
- `id`, `user_id`, `account_name`, `client_id`, `api_key`, `currency`, `sync_start_date`, `last_synced_at`, `balance_available`, `balance_fetched_at`, `created_at`
- Row-Level Security enabled with a single permissive policy for ALL operations scoped to `auth.uid() = user_id`
- A `airwallex_connections_safe` view that exposes all columns **except** `client_id` and `api_key` (matching the pattern of `stripe_connections_safe`, `wise_connections_safe`)
- A `get_airwallex_connection_with_key` SECURITY DEFINER function for use by the edge function

---

### Part 2 — Edge Function: `supabase/functions/airwallex-sync/index.ts`

**New file** implementing the edge function exactly as specified:

- CORS headers matching the wider set used by `stripe-sync` (includes `x-supabase-client-*` headers)
- Auth: validates Bearer token via `supabase.auth.getUser()` using the anon client
- Fetches credentials securely via `get_airwallex_connection_with_key` RPC using the service role client
- Fetches a fresh Airwallex Bearer token per invocation via `POST /api/v1/authentication/login` (stateless)
- Determines date window from `last_synced_at` → `sync_start_date` → default days-back (90 incremental / 730 full)
- Paginates `GET /api/v1/financial_transactions` with `page_num` + `page_size=100`
- Maps each transaction to our schema:
  - `id: "airwallex-" + t.id` (deterministic)
  - Type mapping: `DEPOSIT → Inflow`, `PAYMENT/FEE → Outflow`, `TRANSFER/FX_CONVERSION/PAYOUT → Transfer`
  - Unknown types: infer from amount sign
- Upserts in 500-row chunks with `{ onConflict: 'id', ignoreDuplicates: true }`
- Updates `last_synced_at` after sync
- Fetches live balance from `GET /api/v1/balances/current` and stores `balance_available` + `balance_fetched_at`
- Returns `{ synced: totalInserted }`

**`supabase/config.toml`** — Add entry:
```toml
[functions.airwallex-sync]
verify_jwt = false
```

---

### Part 3 — Settings UI Section

**File:** `src/pages/Settings.tsx`

Following the exact same pattern as the Stripe section (which has the most similar fields — no wizard needed, just a direct form):

**New state added:**
```typescript
interface AirwallexConnection {
  id: string;
  account_name: string;
  currency: string;
  sync_start_date: string | null;
  last_synced_at: string | null;
  balance_available: number | null;
  balance_fetched_at: string | null;
  created_at: string;
}
```

State variables:
- `airwallexConnections: AirwallexConnection[]`
- `airwallexSyncingId: string | null`
- `airwallexFormOpen: boolean`
- `airwallexForm: { account_name, client_id, api_key, currency, sync_start_date }`
- `airwallexAdding: boolean`

**`loadData()` updated** to also fetch from `airwallex_connections_safe` in the `Promise.all`.

**Handlers added:**
- `handleAirwallexAdd()` — INSERT into `airwallex_connections` with `user_id` set to `user.id`
- `handleAirwallexSync(id, fullSync)` — invokes `airwallex-sync` edge function
- `handleAirwallexDelete(id)` — DELETE from `airwallex_connections`

**New section rendered** between Stripe and Accounts sections:
- Header: "Airwallex Integrations" with a globe/currency icon (using `Globe` from lucide-react, colored `#0e6cc4`)
- "Add Connection" button that expands an inline form with fields: Account Name, Client ID, API Key (password input), Currency (default EUR), Sync Start Date (optional date picker)
- Connection cards matching the Stripe card style: account name badge, currency chip, last synced date, balance if available
- Per-card actions: Sync Now (with Full Sync dropdown popover), Delete

---

### Part 4 — Wire into `handleSyncAll` in Index.tsx

**File:** `src/pages/Index.tsx`

After the existing Stripe sync block (lines ~89-100), add:

```typescript
// Sync Airwallex connections
const { data: airwallexConns } = await supabase
  .from('airwallex_connections_safe' as any)
  .select('id, account_name');
if (airwallexConns?.length) {
  for (const conn of airwallexConns as any[]) {
    const res = await supabase.functions.invoke('airwallex-sync', {
      body: { connection_id: conn.id, full_sync: fullSync },
    });
    if (!res.error && res.data) totalInserted += res.data.synced || 0;
  }
}
```

Also update the "no connections" check:
```typescript
if (!wiseConns?.length && !paypalConns?.length && !stripeConns?.length && !airwallexConns?.length) {
```

---

### Technical Details

| File | Change |
|------|--------|
| `supabase/migrations/[timestamp].sql` | New table, RLS, safe view, RPC function |
| `supabase/functions/airwallex-sync/index.ts` | New edge function (full implementation as specified) |
| `supabase/config.toml` | Add `[functions.airwallex-sync]` entry |
| `src/pages/Settings.tsx` | Add Airwallex state, handlers, UI section |
| `src/pages/Index.tsx` | Add Airwallex block to `handleSyncAll` |

**Security constraints maintained:**
- `api_key` and `client_id` never reach the frontend — credentials fetched only via SECURITY DEFINER RPC in the edge function using the service role key
- The `airwallex_connections_safe` view exposes `id`, `user_id`, `account_name`, `currency`, `sync_start_date`, `last_synced_at`, `balance_available`, `balance_fetched_at`, `created_at` — no secrets
- All upserts use `ignoreDuplicates: true` with deterministic IDs (`"airwallex-" + t.id`)
- RLS policy uses `FOR ALL` to cover SELECT/INSERT/UPDATE/DELETE in one policy, consistent with the request spec
