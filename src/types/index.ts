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
