export enum Currency {
  EUR = 'EUR',
  USD = 'USD',
  MAD = 'MAD',
  GBP = 'GBP',
  ILS = 'ILS',
  DKK = 'DKK',
  SEK = 'SEK',
}

export enum TransactionType {
  INFLOW = 'Inflow',
  OUTFLOW = 'Outflow',
  TRANSFER = 'Transfer',
}

export type ViewState = 'DASHBOARD' | 'TRANSACTIONS' | 'AI_INSIGHTS' | 'PNL';

export interface PnlMonth {
  month: string;
  gross_revenue_eur: number;
  net_revenue_eur: number;
  cogs_eur: number;
  gross_profit_eur: number;
  variable_costs_eur: number;
  contribution_margin_eur: number;
  opex_eur: number;
  ebitda_eur: number;
  transaction_count: number;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  currency: Currency;
  account: string;
  type: TransactionType;
  notes?: string;
  runningBalance?: number;
  balanceAvailable?: number;
  balanceReserved?: number;
  createdAt?: string;
}

export interface AccountSummary {
  account: string;
  currency: Currency;
  total: number;
  available: number;
  reserved: number;
  tier: 'LIQUID_BANK' | 'PROCESSOR' | 'ASSET';
  lastUpdated: string;
}

export interface DashboardAccountBalance {
  account: string;
  currency: string;
  total: number;
  available: number;
  reserved: number;
  tier: string;
  balance_eur: number;
  last_updated: string;
}

export interface DashboardEquityPoint {
  date: string;
  equity: number;
}

export interface DashboardMonthlyFlow {
  month: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface DashboardData {
  accountBalances: DashboardAccountBalance[];
  equityTrend: DashboardEquityPoint[];
  monthlyFlows: DashboardMonthlyFlow[];
}

export interface AccountAnomaly {
  id: string;
  account: string;
  detected_date: string;
  expected_balance: number;
  actual_balance: number;
  gap_amount: number;
  gap_percent: number | null;
  severity: 'warning' | 'alert' | 'critical';
  status: 'open' | 'expected' | 'resolved' | 'dismissed';
  auto_resolve_reason: string | null;
  notes: string | null;
  created_at: string;
}
