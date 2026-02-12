

## Optimize Dashboard Performance

Four targeted changes to reduce load time and unnecessary computation.

### 1. Conditional rendering instead of display:none

**File:** `src/pages/Index.tsx` (lines ~178-200)

Replace the three `<div style={{ display: ... }}>` wrappers with conditional rendering using `&&`. This prevents inactive views (and their charts, computations) from running in the background.

```
Before: <div style={{ display: currentView === 'DASHBOARD' ? 'block' : 'none' }}>
After:  {currentView === 'DASHBOARD' && (<Dashboard ... />)}
```

Same pattern for TRANSACTIONS and AI_INSIGHTS views.

### 2. Wrap chart components with React.memo()

**Files:** 5 dashboard components

- `src/components/dashboard/LiquidityHeader.tsx`
- `src/components/dashboard/CashFlowWaterfall.tsx`
- `src/components/dashboard/EquityTrendChart.tsx`
- `src/components/dashboard/AccountBreakdown.tsx`
- `src/components/dashboard/AccountDashboard.tsx`

Change the component definition pattern from:
```typescript
const ComponentName: React.FC<Props> = (props) => {
```
to:
```typescript
const ComponentName: React.FC<Props> = React.memo((props) => {
```
And close with `})` instead of `}`.

This prevents re-renders when parent state changes but props haven't changed.

### 3. Faster transaction fetching

**File:** `src/services/dataService.ts` (lines 51-77)

- Increase `batchSize` from 1000 to 5000
- On the first request, use `select('*', { count: 'exact' })` to get total count
- Use that count to determine when all rows are fetched, instead of probing with empty responses

### 4. Avoid redundant filtering in AccountDashboard

**File:** `src/components/dashboard/AccountDashboard.tsx` (lines ~37-38)

Pass the already-filtered `accountTxs` directly to `computeMonthlyFlows()` and `computeCategoryBreakdown()` without the account parameter, since both functions accept an optional account and filter internally. This avoids filtering the full transaction array twice.

```typescript
// Before
const monthlyFlows = useMemo(() => computeMonthlyFlows(transactions, account), [transactions, account]);
const categoryBreakdown = useMemo(() => computeCategoryBreakdown(transactions, account), [transactions, account]);

// After
const monthlyFlows = useMemo(() => computeMonthlyFlows(accountTxs), [accountTxs]);
const categoryBreakdown = useMemo(() => computeCategoryBreakdown(accountTxs), [accountTxs]);
```
