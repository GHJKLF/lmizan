

## Complete UI/UX Redesign of Lmizan

### Overview
A visual-only redesign across the entire application: dark navy sidebar, refined KPI cards, cleaner charts, polished tables, and a restructured Settings page. All existing functionality, data fetching, and business logic remain untouched.

### Scope of Changes

---

### Part 1: Design System Tokens

**File: `src/index.css`**

Replace the `:root` and `.dark` CSS variable blocks with the new design system:

- `--background`: mapped to #F8FAFC (slate-50)
- `--foreground`: mapped to #0F172A (slate-900)
- `--card` / `--card-foreground`: white surface + slate-900 text
- `--primary`: mapped to #6366F1 (indigo-500)
- `--primary-foreground`: white
- `--muted` / `--muted-foreground`: slate-100 / #64748B
- `--border`: mapped to #E2E8F0
- `--sidebar-background`: #0F172A (dark navy)
- `--sidebar-foreground`: #94A3B8
- `--sidebar-primary`: #6366F1 (indigo accent)
- `--sidebar-accent`: #1E293B (hover/active bg)
- New custom properties: `--color-inflow: #10B981`, `--color-outflow: #EF4444`, `--color-transfer: #F59E0B`
- Chart colors updated: chart-1=#6366F1 (indigo), chart-2=#10B981 (green/inflow), chart-3=#EF4444 (red/outflow), chart-4=#8B5CF6, chart-5=#06B6D4
- Add `font-variant-numeric: tabular-nums` utility for number elements
- Add Inter font import via Google Fonts in `index.html`
- Dark mode variables also updated to match the new palette (keeping the dark navy aesthetic consistent)

---

### Part 2: Sidebar Redesign

**File: `src/components/AppSidebar.tsx`**

Major visual overhaul (same props interface, same logic):

- Background: `bg-[#0F172A]` full-height dark navy, width stays 72 (w-72 = 288px, close to 240px spec)
- Logo: Scale icon in white + "Lmizan" in white Inter 600, "Finance OS" in indigo-400 text below
- Nav items restyled:
  - Default: text-[#94A3B8], no background
  - Hover: bg-[#1E293B], text-[#CBD5E1]
  - Active: bg-[#1E293B], text-[#F1F5F9], left border 3px solid #6366F1
  - Remove the current `bg-primary text-primary-foreground shadow-lg` active style
- Section headers ("PORTFOLIOS", "BANKING", etc.): 10px uppercase, text-[#475569], letter-spacing 0.08em
- Account sub-items: 13px text, text-[#64748B], remove bullet dots (the colored circle indicators)
- Portfolio groups: collapsed by default (`expandedGroups` initial state all false)
- "All Portfolios" item: dark-themed styling to match
- Footer (Settings + Logout): text-[#94A3B8], above a border-t in #1E293B
- Context menu + rename modal: keep existing logic, adjust colors for dark overlay

---

### Part 3: Top Navigation Bar

**File: `src/pages/Index.tsx`**

- Wrap action bar in a proper header: bg-white, h-14, border-b border-[#E2E8F0], px-6
- Left side: page title (h1, 20px, font-weight 600, text-[#0F172A]) showing current view name
- Right side: compact ghost buttons (h-8, border #E2E8F0, 13px font, rounded-lg)
- "Import" stays as the only filled indigo button (bg-[#6366F1])
- "Sync Latest" with dropdown chevron
- Main content area: bg-[#F8FAFC], padding 24px

---

### Part 4: KPI Cards Redesign

**Files: `src/components/dashboard/LiquidityHeader.tsx`, `src/components/pnl/PnlReport.tsx`, `src/components/equity/EquityDashboard.tsx`, `src/components/dashboard/AccountDashboard.tsx`**

All stat/KPI cards updated to:
- Border: 1px solid #E2E8F0, border-radius 12px
- Shadow: `shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]`
- Padding: 20px 24px
- Label: 11px uppercase, text-[#64748B], letter-spacing 0.05em
- Icon: right-aligned in a 32px tinted rounded background
- Number: 36px (text-4xl), font-weight 700, tabular-nums
- Positive: text-[#10B981], Negative: text-[#EF4444]
- Subtitle: 13px, text-[#94A3B8]

---

### Part 5: Charts Redesign

**File: `src/components/dashboard/EquityTrendChart.tsx`**
- Remove CartesianGrid or make stroke #F1F5F9 (very faint)
- Curve: stroke #6366F1, strokeWidth 2
- Area gradient: rgba(99,102,241,0.15) to rgba(99,102,241,0)
- Remove card outer border (or make very subtle)
- Axis labels: 11px, fill #94A3B8

**File: `src/components/dashboard/CashFlowWaterfall.tsx`**
- Inflow bars: fill #10B981 (green)
- Outflow bars: fill #EF4444 (red)
- Remove CartesianGrid, keep only bottom XAxis line
- Bar border-radius 4px top

**File: `src/components/dashboard/AccountBreakdown.tsx`**
- Color palette: ['#6366F1','#8B5CF6','#06B6D4','#10B981','#F59E0B','#94A3B8']
- Horizontal bars with rounded right corners 4px
- Left labels: 12px, fill #64748B

---

### Part 6: Data Tables Redesign

**Files: `src/components/transactions/TransactionTable.tsx`, `src/components/dashboard/AnomalySection.tsx`, `src/components/equity/EquityDashboard.tsx` (asset breakdown table), `src/components/pnl/PnlReport.tsx` (monthly table)**

All tables:
- Header: bg-[#F8FAFC], 11px uppercase text-[#64748B], letter-spacing 0.05em
- Header bottom: 2px solid #E2E8F0
- Row height: 48px (py-3)
- Row border: 1px solid #F1F5F9 (very faint)
- Hover: bg-[#F8FAFC]
- Number columns: text-right, tabular-nums, font-weight 500
- Positive: text-[#10B981] font-weight 600
- Negative: text-[#EF4444] font-weight 600

---

### Part 7: Badge/Tier Redesign

**Files: `src/components/equity/EquityDashboard.tsx`, `src/components/dashboard/AccountBreakdown.tsx`**

New pill badges (rounded, uppercase 11px, px-2 py-0.5):
- Bank: bg-[#EEF2FF] text-[#4338CA]
- Processor: bg-[#F5F3FF] text-[#7C3AED]
- Asset: bg-[#FFFBEB] text-[#B45309]
- Crypto: bg-[#FFF7ED] text-[#C2410C]

---

### Part 8: Button Styling

**File: `src/components/ui/button.tsx`**

Update `buttonVariants`:
- Default (primary): bg-[#6366F1], hover bg-[#4F46E5], text white, rounded-lg (8px)
- Secondary/outline: bg white, border #E2E8F0, text #374151, hover bg #F9FAFB
- Destructive: bg #FEF2F2, text #EF4444, border #FEE2E2, hover bg #FEE2E2
- All: h-9 (36px), px-3.5, text-[13px], font-medium

Action buttons in `Index.tsx` also updated with these styles.

---

### Part 9: Settings Page Redesign

**File: `src/pages/Settings.tsx`**

- Group integrations into collapsible cards:
  - "Wise Integrations (N)" -- click header to expand/collapse
  - "PayPal Integrations (N)"
  - "Stripe Integrations (N)"
  - "Airwallex Integrations (N)"
- Default: all collapsed, showing just header with logo/icon + name + count badge
- Each connection row: 48px, account name + currency badge + last synced, actions right-aligned
- "Connect" button in card header (top right)
- Page background: #F8FAFC
- Back button + page title in top bar style

---

### Part 10: Global Layout

**File: `src/pages/Index.tsx`**

- Outer container: bg-[#F8FAFC]
- Main content padding: p-6 (24px)
- Cards are white elevated surfaces on the slate background

---

### Files Modified (Summary)

| File | Changes |
|------|---------|
| `index.html` | Add Inter font import |
| `src/index.css` | New CSS token values |
| `src/components/ui/button.tsx` | Updated variant styles |
| `src/components/AppSidebar.tsx` | Dark navy sidebar redesign |
| `src/pages/Index.tsx` | Top nav bar + layout bg |
| `src/components/dashboard/LiquidityHeader.tsx` | KPI card styling |
| `src/components/dashboard/EquityTrendChart.tsx` | Chart colors/grid |
| `src/components/dashboard/CashFlowWaterfall.tsx` | Chart colors/grid |
| `src/components/dashboard/AccountBreakdown.tsx` | Bar colors + tier badges |
| `src/components/dashboard/AccountDashboard.tsx` | KPI card styling |
| `src/components/dashboard/AnomalySection.tsx` | Table styling |
| `src/components/transactions/TransactionTable.tsx` | Table styling |
| `src/components/pnl/PnlReport.tsx` | KPI cards + table styling |
| `src/components/equity/EquityDashboard.tsx` | KPI cards + table + tier badges |
| `src/pages/Settings.tsx` | Collapsible integration groups |

### Important Notes
- Zero changes to data fetching, RPCs, edge functions, or business logic
- All existing functionality preserved
- Dark mode CSS variables also updated for consistency
- Implementation priority: Sidebar -> Layout/Nav -> KPI Cards -> Charts -> Tables -> Badges -> Buttons -> Settings

