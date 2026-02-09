import { Transaction, Currency, AccountSummary } from '@/types';
import { FX_RATES } from '@/constants';

const TIER_MAP: Record<string, AccountSummary['tier']> = {};

const classifyTier = (account: string): AccountSummary['tier'] => {
  const n = account.toLowerCase();
  if (n.includes('asset')) return 'ASSET';
  if (
    n.includes('stripe') ||
    n.includes('paypal') ||
    n.includes('payoneer') ||
    n.includes('woo') ||
    n.includes('airwallex') ||
    n.includes('worldfirst') ||
    n.includes('binance')
  )
    return 'PROCESSOR';
  return 'LIQUID_BANK';
};

export const toEUR = (amount: number, currency: Currency): number => {
  const rate = FX_RATES[currency] ?? 1;
  return amount * rate;
};

export const formatEUR = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatAmount = (value: number, currency: Currency): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const computeAccountSummaries = (transactions: Transaction[]): AccountSummary[] => {
  const accountMap = new Map<string, Transaction[]>();

  transactions.forEach((tx) => {
    const key = tx.account;
    if (!accountMap.has(key)) accountMap.set(key, []);
    accountMap.get(key)!.push(tx);
  });

  const summaries: AccountSummary[] = [];

  accountMap.forEach((txs, account) => {
    // Sort by date descending to get latest
    const sorted = [...txs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latest = sorted[0];
    const currency = latest.currency;

    // Use runningBalance if available, otherwise compute from inflows/outflows
    let total = 0;
    let available = 0;
    let reserved = 0;

    if (latest.runningBalance !== undefined && latest.runningBalance !== null) {
      total = latest.runningBalance;
      available = latest.balanceAvailable ?? total;
      reserved = latest.balanceReserved ?? 0;
    } else {
      // Compute from transaction history
      txs.forEach((tx) => {
        if (tx.type === 'Inflow') total += tx.amount;
        else total -= tx.amount;
      });
      available = total;
    }

    summaries.push({
      account,
      currency,
      total,
      available,
      reserved,
      tier: classifyTier(account),
      lastUpdated: latest.date,
    });
  });

  return summaries;
};

export interface LiquiditySnapshot {
  totalLiquidCash: number; // EUR
  totalReserved: number; // EUR
  totalEquity: number; // EUR
  liquidAssets: number; // EUR
  fixedAssets: number; // EUR
  reservedPercentage: number;
}

export const computeLiquiditySnapshot = (summaries: AccountSummary[]): LiquiditySnapshot => {
  let totalLiquidCash = 0;
  let totalReserved = 0;
  let liquidAssets = 0;
  let fixedAssets = 0;

  summaries.forEach((s) => {
    const eurTotal = toEUR(s.total, s.currency);
    const eurReserved = toEUR(s.reserved, s.currency);

    if (s.tier === 'ASSET') {
      fixedAssets += eurTotal;
    } else {
      totalLiquidCash += eurTotal;
      totalReserved += eurReserved;
      liquidAssets += eurTotal;
    }
  });

  const totalEquity = liquidAssets + fixedAssets;
  const reservedPercentage = totalLiquidCash > 0 ? (totalReserved / totalLiquidCash) * 100 : 0;

  return { totalLiquidCash, totalReserved, totalEquity, liquidAssets, fixedAssets, reservedPercentage };
};

export interface MonthlyFlow {
  month: string;
  inflow: number;
  outflow: number;
  net: number;
}

export const computeMonthlyFlows = (transactions: Transaction[], account?: string): MonthlyFlow[] => {
  const filtered = account ? transactions.filter((t) => t.account === account) : transactions;
  const monthMap = new Map<string, { inflow: number; outflow: number }>();

  filtered.forEach((tx) => {
    const month = tx.date.substring(0, 7); // YYYY-MM
    if (!monthMap.has(month)) monthMap.set(month, { inflow: 0, outflow: 0 });
    const entry = monthMap.get(month)!;
    const eurAmount = toEUR(tx.amount, tx.currency);
    if (tx.type === 'Inflow') entry.inflow += eurAmount;
    else entry.outflow += eurAmount;
  });

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      inflow: Math.round(data.inflow),
      outflow: Math.round(data.outflow),
      net: Math.round(data.inflow - data.outflow),
    }));
};

export interface EquityPoint {
  date: string;
  equity: number;
}

export const computeEquityTrend = (transactions: Transaction[]): EquityPoint[] => {
  const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let running = 0;
  const dailyMap = new Map<string, number>();

  sorted.forEach((tx) => {
    const eurAmount = toEUR(tx.amount, tx.currency);
    if (tx.type === 'Inflow') running += eurAmount;
    else running -= eurAmount;
    dailyMap.set(tx.date, Math.round(running));
  });

  return Array.from(dailyMap.entries()).map(([date, equity]) => ({ date, equity }));
};

export interface AccountBreakdownItem {
  account: string;
  balanceEUR: number;
  originalBalance: number;
  currency: Currency;
  tier: AccountSummary['tier'];
}

export const computeAccountBreakdown = (summaries: AccountSummary[]): AccountBreakdownItem[] => {
  return summaries
    .map((s) => ({
      account: s.account,
      balanceEUR: Math.round(toEUR(s.total, s.currency)),
      originalBalance: s.total,
      currency: s.currency,
      tier: s.tier,
    }))
    .sort((a, b) => Math.abs(b.balanceEUR) - Math.abs(a.balanceEUR));
};

export interface CategoryBreakdown {
  category: string;
  amount: number;
}

export const computeCategoryBreakdown = (transactions: Transaction[], account?: string): CategoryBreakdown[] => {
  const filtered = account ? transactions.filter((t) => t.account === account) : transactions;
  const catMap = new Map<string, number>();

  filtered.forEach((tx) => {
    const eur = toEUR(tx.amount, tx.currency);
    catMap.set(tx.category, (catMap.get(tx.category) ?? 0) + eur);
  });

  return Array.from(catMap.entries())
    .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount);
};
