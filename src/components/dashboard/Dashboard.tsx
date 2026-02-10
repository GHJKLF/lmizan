import React, { useMemo } from 'react';
import { Transaction } from '@/types';
import {
  computeAccountSummaries,
  computeLiquiditySnapshot,
  computeEquityTrend,
  computeMonthlyFlows,
  computeAccountBreakdown,
} from '@/services/balanceEngine';
import LiquidityHeader from './LiquidityHeader';
import EquityTrendChart from './EquityTrendChart';
import CashFlowWaterfall from './CashFlowWaterfall';
import AccountBreakdown from './AccountBreakdown';
import AccountDashboard from './AccountDashboard';
import { Loader2 } from 'lucide-react';

interface Props {
  transactions: Transaction[];
  selectedAccount: string | 'ALL';
  onSelectAccount: (account: string | 'ALL') => void;
  loading: boolean;
}

const Dashboard: React.FC<Props> = ({ transactions, selectedAccount, onSelectAccount, loading }) => {
  const summaries = useMemo(() => computeAccountSummaries(transactions), [transactions]);
  const snapshot = useMemo(() => computeLiquiditySnapshot(summaries), [summaries]);
  const equityTrend = useMemo(() => computeEquityTrend(transactions), [transactions]);
  const monthlyFlows = useMemo(() => computeMonthlyFlows(transactions), [transactions]);
  const accountBreakdown = useMemo(() => computeAccountBreakdown(summaries), [summaries]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (selectedAccount !== 'ALL') {
    const accountSummaries = summaries.filter((s) => s.account === selectedAccount);
    return (
      <AccountDashboard
        account={selectedAccount}
        summaries={accountSummaries}
        transactions={transactions}
        onBack={() => onSelectAccount('ALL')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <LiquidityHeader snapshot={snapshot} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EquityTrendChart data={equityTrend} />
        <CashFlowWaterfall data={monthlyFlows} />
      </div>

      <AccountBreakdown data={accountBreakdown} onSelectAccount={onSelectAccount} />
    </div>
  );
};

export default Dashboard;
