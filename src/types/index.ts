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
}

export type ViewState = 'DASHBOARD' | 'TRANSACTIONS' | 'AI_INSIGHTS';

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
