import React, { useMemo } from 'react';
import { Transaction, DashboardData, DashboardAccountBalance, Currency } from '@/types';
import {
  computeAccountSummaries,
  LiquiditySnapshot,
  AccountBreakdownItem,
} from '@/services/balanceEngine';
import KPIRow from './KPIRow';
import EquityChart from './EquityChart';
import CashFlowChart from './CashFlowChart';
import AccountMap from './AccountMap';
import AccountDetail from './AccountDetail';
import AnomalySection from './AnomalySection';
import { Loader2 } from 'lucide-react';

interface Props {
  dashboardData: DashboardData | null;
  transactions: Transaction[];
  selectedAccount: string | 'ALL';
  onSelectAccount: (account: string | 'ALL') => void;
  loading: boolean;
  txLoading: boolean;
  anomalyRefreshKey: number;
}

const computeSnapshotFromBalances = (balances: DashboardAccountBalance[]): LiquiditySnapshot => {
  let totalLiquidCash = 0, totalReserved = 0, liquidAssets = 0, fixedAssets = 0;
  balances.forEach((b) => {
    const rate = b.balance_eur !== 0 && b.total !== 0 ? b.balance_eur / b.total : 1;
    if (b.tier === 'ASSET') { fixedAssets += b.balance_eur; }
    else { totalLiquidCash += b.available * rate; totalReserved += b.reserved * rate; liquidAssets += b.balance_eur; }
  });
  const totalEquity = liquidAssets + fixedAssets;
  const reservedPercentage = totalLiquidCash > 0 ? (totalReserved / totalLiquidCash) * 100 : 0;
  return { totalLiquidCash, totalReserved, totalEquity, liquidAssets, fixedAssets, reservedPercentage };
};

const computeBreakdownFromBalances = (balances: DashboardAccountBalance[]): AccountBreakdownItem[] => {
  return balances
    .map((b) => ({ account: b.account, balanceEUR: Math.round(b.balance_eur), originalBalance: b.total, currency: b.currency as Currency, tier: b.tier as 'LIQUID_BANK' | 'PROCESSOR' | 'ASSET' }))
    .sort((a, b) => Math.abs(b.balanceEUR) - Math.abs(a.balanceEUR));
};

const NewDashboard: React.FC<Props> = ({ dashboardData, transactions, selectedAccount, onSelectAccount, loading, txLoading, anomalyRefreshKey }) => {
  const accountSummaries = useMemo(() => {
    if (selectedAccount === 'ALL' || transactions.length === 0) return [];
    return computeAccountSummaries(transactions.filter(t => t.account === selectedAccount));
  }, [transactions, selectedAccount]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!dashboardData) return null;

  if (selectedAccount !== 'ALL') {
    if (txLoading) {
      return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }
    return <AccountDetail account={selectedAccount} summaries={accountSummaries} transactions={transactions} onBack={() => onSelectAccount('ALL')} />;
  }

  const snapshot = computeSnapshotFromBalances(dashboardData.accountBalances);
  const accountBreakdown = computeBreakdownFromBalances(dashboardData.accountBalances);

  return (
    <div className="space-y-6">
      <KPIRow snapshot={snapshot} monthlyFlows={dashboardData.monthlyFlows} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EquityChart data={dashboardData.equityTrend} />
        <CashFlowChart data={dashboardData.monthlyFlows} />
      </div>
      <AccountMap data={accountBreakdown} onSelectAccount={onSelectAccount} />
      <AnomalySection refreshKey={anomalyRefreshKey} />
    </div>
  );
};

export default NewDashboard;
