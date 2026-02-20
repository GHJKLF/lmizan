

## Phase 4: P&L Engine

### Overview
Add a complete Profit & Loss reporting system with a new database RPC, a dedicated P&L page, and sidebar navigation entry.

### 1. Database: New RPC `get_pnl_report`

Create a `SECURITY DEFINER` SQL function `get_pnl_report(p_year int DEFAULT 2024)` that returns monthly P&L rows.

**Logic:**
- Groups transactions by `to_char(date, 'YYYY-MM')` for the given year
- FX conversion via inline CASE (EUR=1.0, USD=0.92, HKD=0.118, GBP=1.17, else 1.0)
- **Gross Revenue**: SUM of Inflow amounts (converted to EUR), excluding Transfers
- **VAT deduction**: EUR inflows divided by 1.21 to get net; non-EUR kept as-is (export/zero-rated)
- **COGS**: Extract fees from `notes` field using `regexp_match(notes, 'Fee: -([0-9.]+)')`, multiply by FX rate. Fallback estimate: PayPal = 3.49% + 0.35, Stripe = 1.5% + 0.25
- **Variable Costs**: Outflows from revenue accounts (PayPal*, Stripe*)
- **OpEx**: Outflows from cost accounts (Wise*, Airwallex*, CIH*, Alison, Ki2powers)
- **EBITDA**: Contribution Margin - OpEx
- **revenue_by_currency**: JSON aggregate of gross revenue broken down by currency
- Filtered by `auth.uid()` via SECURITY DEFINER

**Return columns:** month, gross_revenue_eur, net_revenue_eur, cogs_eur, gross_profit_eur, variable_costs_eur, contribution_margin_eur, opex_eur, ebitda_eur, transaction_count, revenue_by_currency

### 2. Types Update

Add `ViewState` value `'PNL'` to the union type. Add a `PnlMonth` interface for the RPC return shape.

### 3. Data Service

Add `DataService.fetchPnlReport(year: number)` that calls `supabase.rpc('get_pnl_report', { p_year: year })`.

### 4. Sidebar Navigation

Add a "P&L" entry in `AppSidebar.tsx` between Dashboard and Transactions, using the `TrendingUp` icon from lucide-react.

### 5. New Page Component: `src/components/pnl/PnlReport.tsx`

**Layout (top to bottom):**

1. **Header**: Year selector dropdown (2022-2026) + "Export CSV" placeholder button
2. **KPI Cards** (4 cards in a row):
   - Annual Gross Revenue
   - Annual Net Revenue (with "excl. 21% VAT" note)
   - Annual EBITDA with margin %
   - Best Month (highest net revenue)
3. **P&L Waterfall**: A styled card showing the tiered breakdown (Gross Rev -> VAT -> Net Rev -> COGS -> Gross Profit -> Variable Costs -> Contribution Margin -> OpEx -> EBITDA) with amounts, % of net revenue, and proportional bars
4. **Monthly P&L Table**: Full table with all columns, EBITDA color-coded green/red, best month highlighted
5. **Revenue by Currency Chart**: Stacked bar chart (recharts) showing EUR/USD/HKD/GBP monthly
6. **EBITDA Trend Line**: Line chart showing monthly EBITDA

### 6. Index.tsx Integration

Add the `PNL` view case to render `<PnlReport />` when `currentView === 'PNL'`.

### 7. App.tsx

No route changes needed -- P&L is a view state within Index, not a separate route.

---

### Technical Details

**Files to create:**
| File | Purpose |
|------|---------|
| `supabase/migrations/[timestamp].sql` | `get_pnl_report` RPC function |
| `src/components/pnl/PnlReport.tsx` | Main P&L page component |

**Files to modify:**
| File | Change |
|------|--------|
| `src/types/index.ts` | Add `'PNL'` to `ViewState`, add `PnlMonth` interface |
| `src/services/dataService.ts` | Add `fetchPnlReport()` method |
| `src/components/AppSidebar.tsx` | Add P&L nav item |
| `src/pages/Index.tsx` | Add PNL view rendering |

**Revenue account detection (in SQL):**
```sql
lower(account) LIKE '%paypal%' OR lower(account) LIKE '%stripe%'
```

**Cost/OpEx account detection (in SQL):**
```sql
lower(account) LIKE '%wise%' OR lower(account) LIKE '%airwallex%'
OR lower(account) LIKE '%cih%' OR lower(account) = 'alison'
OR lower(account) = 'ki2powers'
```

**Fee extraction SQL pattern:**
```sql
COALESCE(
  (regexp_match(notes, 'Fee: -([0-9.]+)'))[1]::numeric,
  CASE WHEN lower(account) LIKE '%paypal%' THEN amount * 0.0349 + 0.35
       WHEN lower(account) LIKE '%stripe%' THEN amount * 0.015 + 0.25
       ELSE 0 END
)
```
