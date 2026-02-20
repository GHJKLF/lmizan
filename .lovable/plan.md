

## Fix: PayPal Sync RESULTSET_TOO_LARGE Error

### Problem
The `paypal-sync` edge function uses 31-day chunks, but a single chunk can contain more than 10,000 transactions (PayPal's hard limit), causing RESULTSET_TOO_LARGE errors and a full sync failure.

### Fix: Adaptive chunk splitting in `supabase/functions/paypal-sync/index.ts`

**Strategy:** Replace the fixed 31-day chunking with smaller 7-day default chunks, plus automatic retry with halved intervals if RESULTSET_TOO_LARGE is still hit.

#### Changes to `fetchTransactionPage`
- Detect RESULTSET_TOO_LARGE in the error response and throw a specific typed error so the caller can handle it differently from other API errors.

#### Changes to the main chunk loop
1. Default chunk size reduced from 31 days to 7 days.
2. Wrap each chunk fetch in a try/catch. If RESULTSET_TOO_LARGE is caught, split that chunk into two halves and push them onto the processing queue (recursive subdivision).
3. This guarantees convergence -- at 1-day granularity, even the busiest day won't exceed 10,000 transactions.

#### Same fix applied to `supabase/functions/process-sync-chunk/index.ts`
The `fetchPaypal` function in the job-based worker has the same vulnerability. Apply the same adaptive subdivision: if a page returns RESULTSET_TOO_LARGE, halve the date range and re-queue by updating the current job's `chunk_end` and creating a new job for the second half.

### Technical Detail

```text
paypal-sync/index.ts changes:

1. New error class: ResultSetTooLargeError
2. fetchTransactionPage: detect 400 + RESULTSET_TOO_LARGE, throw ResultSetTooLargeError
3. Chunk building: 31 days -> 7 days
4. Chunk processing loop: wrap in try/catch
   - On ResultSetTooLargeError: split chunk at midpoint, push both halves back to queue
   - Minimum chunk = 1 day (safety floor)

process-sync-chunk/index.ts changes:

1. fetchPaypal: detect RESULTSET_TOO_LARGE on the API call
2. On detection: update current job's chunk_end to midpoint, insert new job for second half
3. Return empty transactions + null cursor so the job re-queues naturally
```

### Scope
- Two edge function files modified
- No database or frontend changes needed
- No new dependencies

