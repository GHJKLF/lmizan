import React, { useMemo } from 'react';
import { Transaction, DashboardData, DashboardAccountBalance, Currency } from '@/types';
import {
  computeAccountSummaries,
  computeLiquiditySnapshot,
  computeEquityTrend,
  computeMonthlyFlows,
  computeAccountBreakdown,
  LiquiditySnapshot,
  AccountBreakdownItem,
} from '@/services/balanceEngine';
import LiquidityHeader from './LiquidityHeader';
import EquityTrendChart from './EquityTrendChart';
import CashFlowWaterfall from './CashFlowWaterfall';
import AccountBreakdown from './AccountBreakdown';
import AccountDashboard from './AccountDashboard';
import { Loader2 } from 'lucide-react';

interface Props {
  dashboardData: DashboardData | null;
  transactions: Transaction[];
  selectedAccount: string | 'ALL';
  onSelectAccount: (account: string | 'ALL') => void;
  loading: boolean;
  txLoading: boolean;
}

// Derive LiquiditySnapshot from pre-computed account balances
const computeSnapshotFromBalances = (balances: DashboardAccountBalance[]): LiquiditySnapshot => {
  let totalLiquidCash = 0;
  let totalReserved = 0;
  let liquidAssets = 0;
  let fixedAssets = 0;

  balances.forEach((b) => {
    const eurTotal = b.balance_eur;
    const rate = b.balance_eur !== 0 && b.total !== 0 ? b.balance_eur / b.total : 1;
    const eurReserved = b.reserved * rate;

    if (b.tier === 'ASSET') {
      fixedAssets += eurTotal;
    } else {
      totalLiquidCash += b.available * rate;
      totalReserved += eurReserved;
      liquidAssets += eurTotal;
    }
  });

  const totalEquity = liquidAssets + fixedAssets;
  const reservedPercentage = totalLiquidCash > 0 ? (totalReserved / totalLiquidCash) * 100 : 0;

  return { totalLiquidCash, totalReserved, totalEquity, liquidAssets, fixedAssets, reservedPercentage };
};

// Derive AccountBreakdownItem[] from pre-computed balances
const computeBreakdownFromBalances = (balances: DashboardAccountBalance[]): AccountBreakdownItem[] => {
  return balances
    .map((b) => ({
      account: b.account,
      balanceEUR: Math.round(b.balance_eur),
      originalBalance: b.total,
      currency: b.currency as Currency,
      tier: b.tier as 'LIQUID_BANK' | 'PROCESSOR' | 'ASSET',
    }))
    .sort((a, b) => Math.abs(b.balanceEUR) - Math.abs(a.balanceEUR));
};

const Dashboard: React.FC<Props> = ({ dashboardData, transactions, selectedAccount, onSelectAccount, loading, txLoading }) => {
  // For single-account drill-down, we still need transactions
  const accountSummaries = useMemo(() => {
    if (selectedAccount === 'ALL' || transactions.length === 0) return [];
    return computeAccountSummaries(transactions.filter(t => t.account === selectedAccount));
  }, [transactions, selectedAccount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dashboardData) return null;

  if (selectedAccount !== 'ALL') {
    if (txLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return (
      <AccountDashboard
        account={selectedAccount}
        summaries={accountSummaries}
        transactions={transactions}
        onBack={() => onSelectAccount('ALL')}
      />
    );
  }

  const snapshot = computeSnapshotFromBalances(dashboardData.accountBalances);
  const accountBreakdown = computeBreakdownFromBalances(dashboardData.accountBalances);

  return (
    <div className="space-y-4">
      <LiquidityHeader snapshot={snapshot} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EquityTrendChart data={dashboardData.equityTrend} />
        <CashFlowWaterfall data={dashboardData.monthlyFlows} />
      </div>

      <AccountBreakdown data={accountBreakdown} onSelectAccount={onSelectAccount} />
    </div>
  );
};

export default Dashboard;
