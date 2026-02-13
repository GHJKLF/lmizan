

## PayPal Sync Architecture Overhaul

### Problem
- PayPal connections show 0 or very few transactions because first sync defaults to 90 days instead of full history
- No automatic scheduled sync -- users must manually click "Sync Latest"
- No background sync-scheduler function for pg_cron

### Changes (PayPal-focused, no Wise/Stripe code changes)

---

### 1. Fix paypal-sync first-sync logic (`supabase/functions/paypal-sync/index.ts`)

Update the intervalStart calculation (lines 107-111) so that when `last_synced_at` is null (first sync), it ALWAYS does a full ~3-year sync regardless of the `full_sync` parameter:

```
const isFirstSync = !conn.last_synced_at;
const intervalStart = (full_sync || isFirstSync)
  ? new Date(Date.now() - (2 * 365 + 335) * 24 * 60 * 60 * 1000).toISOString()
  : new Date(conn.last_synced_at).toISOString();
```

Add a debug log after the fetch loop:
```
console.log(`PayPal sync: chunks=${chunks.length} fetched=${allTxDetails.length} range=${intervalStart} to ${intervalEnd}`);
```

Also update auth to support service-role calls from the scheduler: if the bearer token matches the service role key pattern (verified via `getUser` failure but service role header present), allow the request by reading the `user_id` from the connection instead.

Specifically, replace the strict user-auth block with a dual-mode approach:
- Try `getUser()` first -- if it succeeds, proceed as normal (user-initiated sync)
- If it fails but the Authorization header contains the service role key, allow the request (scheduler-initiated sync) -- the `user_id` comes from the connection record itself
- This is safe because the connection lookup uses `get_paypal_connection_with_secret` (a SECURITY DEFINER function) via service role client

### 2. Auto-trigger full sync on first connection (`src/components/PayPalConnectionWizard.tsx`)

The wizard already triggers sync on line 116, but without `full_sync: true`. Since we're fixing the edge function to always do full sync when `last_synced_at` is null, no change needed here -- the edge function will automatically detect it's a first sync.

No changes to this file.

### 3. Create sync-scheduler edge function (`supabase/functions/sync-scheduler/index.ts`)

New edge function that:
- Authenticates using the service role key (no user session -- called by pg_cron)
- Queries all `paypal_connections`, `wise_connections`, and `stripe_connections` using service role client
- For each connection, calls the respective sync function via `fetch()` to the edge function URL, passing the service role key as the Authorization bearer token and `full_sync: false`
- Logs results per connection and returns a JSON summary
- Handles errors per-connection (one failure doesn't stop others)

### 4. Update config.toml

Add entry for sync-scheduler:
```toml
[functions.sync-scheduler]
verify_jwt = false
```

### 5. Database: Enable pg_cron + pg_net and schedule the job

**Migration**: Enable `pg_cron` and `pg_net` extensions:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

**Data insert** (not migration, contains project-specific values): Schedule the cron job to run every 4 hours:
```sql
SELECT cron.schedule(
  'sync-all-connections',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://bxrxrdloufobxdkdehtc.supabase.co/functions/v1/sync-scheduler',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### 6. No changes to Index.tsx

The existing `handleSyncAll` already passes `full_sync` correctly. The PayPalConnectionWizard already auto-triggers sync on connection. No UI changes needed.

### Files touched
1. `supabase/functions/paypal-sync/index.ts` -- fix first-sync logic + add scheduler auth bypass
2. `supabase/functions/sync-scheduler/index.ts` -- new file
3. `supabase/config.toml` -- add sync-scheduler entry (auto-managed)
4. Database migration -- enable pg_cron and pg_net
5. Database insert -- schedule the cron job

### Files NOT touched
- `supabase/functions/wise-sync/index.ts`
- `supabase/functions/stripe-sync/index.ts`
- `src/pages/Index.tsx`
- `src/components/PayPalConnectionWizard.tsx`
