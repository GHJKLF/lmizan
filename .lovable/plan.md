

## Fix `mapType` function in stripe-sync

**Problem**: The `mapType` function uses hardcoded Sets of Stripe transaction type names to determine Inflow/Outflow direction. This fails for transaction types that can go either way (e.g., payout reversals have type "payout" but positive net).

**Fix**: Replace the function body to use only the `net` amount sign, which is always the correct indicator from Stripe's API.

### Technical Details

**File**: `supabase/functions/stripe-sync/index.ts` (lines 23-30)

**Before**:
```typescript
function mapType(txType: string, net: number): string {
  const inflowTypes = new Set(["charge", "payment", "payment_refund_reversal", "transfer", "payout_cancel"]);
  const outflowTypes = new Set(["payout", "refund", "dispute", "payment_failure_refund", "payout_failure"]);

  if (inflowTypes.has(txType)) return "Inflow";
  if (outflowTypes.has(txType)) return "Outflow";
  return net >= 0 ? "Inflow" : "Outflow";
}
```

**After**:
```typescript
function mapType(txType: string, net: number): string {
  return net >= 0 ? "Inflow" : "Outflow";
}
```

One-line body change. No other modifications to the file.

