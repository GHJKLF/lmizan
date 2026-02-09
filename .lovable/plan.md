

# Imizan Migration Plan: AI Studio → Lovable

## Overview
Migrate your multi-currency financial operating system (Imizan) to Lovable, preserving all existing functionality while upgrading the AI layer to use Lovable AI instead of direct Google Gemini SDK calls.

---

## Phase 1: Core Foundation
Set up the data layer, types, and constants that power the entire app.

- **Types & Constants** — Port `Currency`, `TransactionType`, `Transaction`, `AccountSummary`, `ViewState` enums/interfaces, plus the 27+ account list, categories, and FX rates
- **Data Service** — Recreate the full transaction CRUD service with dual-mode storage (Supabase + localStorage fallback), batch insert with chunked uploads, fingerprint-based duplicate detection, account renaming, and factory reset
- **Supabase Connection** — Connect to Lovable Cloud for the database backend with a `transactions` table matching your existing schema (id, date, description, category, amount, currency, account, type, notes, running_balance, balance_available, balance_reserved)

## Phase 2: Layout & Navigation
Build the app shell with sidebar navigation and header.

- **Sidebar** — Fixed left sidebar with grouped account navigation (Banking, Processors, Crypto, Assets), view switching (Dashboard / Transactions / AI Insights), account renaming, and settings access
- **Header Bar** — Page title, record count indicator, profile avatar, and utility buttons (Fix Liquidity, Reset Baseline)
- **View Persistence** — CSS display toggling (not conditional rendering) to preserve component state when switching tabs

## Phase 3: Liquidity Control Tower (Dashboard)
The main dashboard with the balance engine and analytics charts.

- **Balance Engine** — Core logic that computes latest balances per account-currency pair using the most recent transaction's `runningBalance`, with 3-tier classification (Liquid Bank / Processor / Asset)
- **Global Liquidity Header** — Three hero cards: Total Liquid Cash (€, normalized to EUR), Reserved Funds (with % bar), Total Business Equity (with liquid vs. fixed asset split)
- **Equity Trend Chart** — Area chart showing combined equity evolution over time, with all-time change percentage
- **Cash Flow Waterfall** — Monthly inflow/outflow waterfall bridge chart
- **Account Liquidity Breakdown** — Horizontal bar chart showing per-account balances normalized to EUR, with original currency tooltips
- **Per-Account Dashboard** — When a specific account is selected: dedicated balance cards, category pie chart, monthly trend, and recent transactions list
- **Embedded AI Assistant** — Inline AI chat within the dashboard for quick financial queries

## Phase 4: Transaction Management
Full transaction CRUD with advanced filtering and bulk operations.

- **Transaction Table** — Sortable, paginated table with inline editing (click-to-edit description, category, amount, type, date, account)
- **Search & Filters** — Text search, category filter, type filter (Inflow/Outflow), date range, and account filter
- **Bulk Actions** — Multi-select with "Select All" and bulk delete
- **Manual Add** — Inline form to add individual transactions
- **Import & Balance Update Buttons** — Quick access to the import modal and balance correction workflow

## Phase 5: AI-Powered Features (via Lovable AI)
Replace direct Gemini SDK calls with Lovable AI edge functions.

- **AI Chat Assistant** — Conversational financial analyst that answers questions about your data, with streaming responses. Sends minified transaction context (recent 200 records) to the AI with your custom financial analyst system prompt
- **Cash Flow Audit ("Where's My Money?")** — Forensic audit that categorizes outflows into Operating Expenses, Balance Sheet Movements, and Timing/Hidden buckets, producing a Profit vs. Cash bridge analysis
- **AI Document Import** — Upload CSV/PDF/image bank statements → edge function processes them through AI to extract and categorize transactions with your detailed extraction rules (Stripe balance change handling, PayPal dual-role processing, LMIZAN classification rules). Includes chunked processing for large files and multi-currency balance aggregation
- **AI Category Suggestion** — Auto-categorize transactions using your LMIZAN business logic rules
- **3-Tier Duplicate Detection** — ID collision check, strong fingerprint (date+amount+description+currency), and weak fingerprint (date+amount+currency) with user review

## Phase 6: Modals & Utilities
Supporting workflows accessed via modals.

- **Update Balance Modal** — Select account → enter actual balance → system calculates discrepancy → generates an "Initial Balance" or adjustment transaction to reconcile
- **Import Modal** — File upload (CSV/PDF/image) → AI analysis → preview extracted transactions with duplicate flags → confirm import with stats (added vs. skipped)
- **Settings Modal (Payout Routing)** — Configure account mappings for payout reconciliation (e.g., Stripe → Wise routing)
- **Payout Reconciler** — CSV-based payout reconciliation for Stripe/Wise with match confidence scoring

## Phase 7: Auth & Polish
Final touches for a production-ready app.

- **Authentication** — Supabase Auth with email/password login (currently bypassed but infrastructure ready)
- **Responsive polish** — Ensure the sidebar, dashboard cards, and charts work well across screen sizes
- **Toast notifications** — Replace `alert()` calls with proper toast notifications for import results, errors, and confirmations

