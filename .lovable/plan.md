

## Stripe Integration Plan

This adds Stripe as a third payment provider alongside Wise and PayPal, following identical patterns.

---

### 1. Database Migration

**Create `stripe_connections` table:**
- Columns: `id` (uuid PK), `user_id` (uuid, NOT NULL), `account_name` (text), `api_key` (text, encrypted at rest), `stripe_account_id` (text), `email` (text), `currency` (text), `environment` (text, default 'live'), `last_synced_at` (timestamptz), `created_at` (timestamptz), `updated_at` (timestamptz)
- RLS policies: authenticated users can SELECT/INSERT/UPDATE/DELETE their own rows (`auth.uid() = user_id`)

**Create `stripe_connections_safe` view:**
- Excludes `api_key` column (same pattern as `paypal_connections_safe` and `wise_connections_safe`)

**Create `get_stripe_connection_with_key` security definer function:**
- Returns full row including `api_key` for use by edge functions only

---

### 2. Edge Functions

**a) `stripe-discover`**
- Input: `{ api_key }`
- Calls `GET https://api.stripe.com/v1/account` (account info) and `GET https://api.stripe.com/v1/balance` (balances)
- Auth: `Authorization: Bearer <api_key>`
- Returns: `{ account_id, email, currencies, balances: [{ currency, available, pending, total }] }`
- Amounts divided by 100 (except zero-decimal currencies like JPY, KRW, etc.)

**b) `stripe-sync`**
- Input: `{ connection_id }`
- Reads API key via `get_stripe_connection_with_key` RPC
- Paginates `GET /v1/balance_transactions?limit=100&starting_after=...`
- Maps each transaction:
  - Amount: `net / 100` (already fee-inclusive), sign-based type detection
  - Type mapping: charge/payment -> Inflow; payout/refund/stripe_fee/dispute -> Outflow; adjustment -> sign-based
  - Dedup key: `stripe_bt:{id}` in notes column
  - Fee info appended to notes: `Fee: -X.XX CUR | Gross: X.XX CUR`
- Handles zero-decimal currencies
- Updates `last_synced_at` after completion

**c) `stripe-balances`**
- Input: `{ connection_id }`
- Calls `GET /v1/balance` using stored API key
- Returns per-currency available, pending, and total amounts (divided by 100)

**Config:** Add all three functions to `supabase/config.toml` with `verify_jwt = false`

---

### 3. UI Components

**a) `StripeConnectionWizard.tsx`**
- 2-step dialog matching PayPal wizard pattern
- Step 1: API key input (password field) + "Discover Account" button calling `stripe-discover`
- Step 2: Shows account ID, email, per-currency balances (available + pending). Account name input + "Connect" button saves to `stripe_connections` and triggers initial `stripe-sync`

**b) Settings page updates (`src/pages/Settings.tsx`)**
- Add "Stripe Integrations" section with "Connect Stripe Account" button
- List Stripe connections with Sync, View Balances, and Delete actions (same UI pattern as PayPal section)
- Import `StripeConnectionWizard`

**c) Index.tsx (Sync All)**
- Add Stripe connections to the `handleSyncAll` flow: query `stripe_connections`, invoke `stripe-sync` for each
- Update the "no connections" check to include Stripe

---

### 4. Technical Details

- Zero-decimal currency list: JPY, KRW, BIF, CLP, DJF, GNF, ISK, KMF, MGA, PYG, RWF, UGX, VND, VUV, XAF, XOF, XPF
- Stripe auth: `Authorization: Bearer sk_live_...` header on all API calls
- No date windowing needed -- cursor-based pagination fetches full history
- `account` field in transactions set to `conn.account_name`
- Stripe brand color: `#635bff` for UI consistency

