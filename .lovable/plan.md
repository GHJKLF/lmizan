

## Fix stripe-sync: Include fees and remove early termination

Two targeted changes to `supabase/functions/stripe-sync/index.ts` to fix missing transactions and incorrect balances.

### Change 1: Stop filtering out `stripe_fee` transactions (line 130)

Stripe fee transactions affect the real balance and must be recorded. Currently they are silently dropped, causing the dashboard balance to diverge from Stripe's actual balance.

**Before:** `const filtered = pageTxs.filter((bt: any) => bt.type !== "stripe_fee");`
**After:** `const filtered = pageTxs;`

### Change 2: Remove early termination logic (lines 163, 203-212)

The "3 consecutive duplicate pages" shortcut causes the forward sync to stop before reaching all transactions. The sync should rely solely on Stripe's `has_more` flag.

**Remove:**
- Line 163: `let consecutiveDupPages = 0;`
- Lines 203-212: The entire `if/else` block checking `consecutiveDupPages >= 3`

### After changes

Redeploy the `stripe-sync` edge function so the fixes take effect immediately.
