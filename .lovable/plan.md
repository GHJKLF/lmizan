# Fix 5 Bugs in balanceEngine.ts

## Bug 1: classifyTier missing ASSET keywords
The classifyTier function only checks for 'asset' keyword but is missing many other asset-type account names from the original implementation.

**Fix:** Change the ASSET check from just `n.includes('asset')` to:
```
if (n.includes('asset') || n.includes('home') || n.includes('car') || n.includes('renovation') || n.includes('inventory') || n.includes('stock') || n.includes('aquablade') || n.includes('madeco')) return 'ASSET';
```

## Bug 2: Binance misclassified as PROCESSOR
Binance is currently classified as PROCESSOR but should be LIQUID_BANK per the original logic.

**Fix:** Remove `n.includes('binance')` from the PROCESSOR condition so it falls through to LIQUID_BANK.

## Bug 3: Account grouping ignores currency
computeAccountSummaries groups transactions by `tx.account` only, but the original groups by `${tx.account}-${tx.currency}` so each account-currency pair is treated separately.

**Fix:** Change the grouping key from `tx.account` to `\${tx.account}-\${tx.currency}`.

## Bug 4: ASSET accounts should have available = 0
In the original logic, ASSET tier accounts always have available forced to 0. The current code does not do this.

**Fix:** After computing the available value for each account, add: `if (classifyTier(account) === 'ASSET') { available = 0; }`

## Bug 5: totalLiquidCash uses total instead of available
In computeLiquiditySnapshot, totalLiquidCash adds `s.total` (via eurTotal) but should use `s.available` to match the original.

**Fix:** Change `totalLiquidCash += eurTotal` to `totalLiquidCash += toEUR(s.available, s.currency)` for non-ASSET accounts.

## Technical Summary
| # | File | Lines | Change |
|---|------|-------|--------|
| 1 | src/services/balanceEngine.ts | 6-20 | Add missing ASSET keywords to classifyTier |
| 2 | src/services/balanceEngine.ts | 6-20 | Remove binance from PROCESSOR tier |
| 3 | src/services/balanceEngine.ts | 40-50 | Group by account-currency pair |
| 4 | src/services/balanceEngine.ts | 60-80 | Force available=0 for ASSET tier |
| 5 | src/services/balanceEngine.ts | 110-120 | Use s.available for totalLiquidCash |