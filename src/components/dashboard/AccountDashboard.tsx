import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Transaction, AccountSummary } from '@/types';
import {
  computeMonthlyFlows,
  computeCategoryBreakdown,
  formatEUR,
  formatAmount,
  toEUR,
} from '@/services/balanceEngine';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  account: string;
  summaries: AccountSummary[];
  transactions: Transaction[];
  onBack: () => void;
}

const PIE_COLORS = ['#6366F1', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4', '#F59E0B', '#94A3B8', '#EC4899'];

const AccountDashboard: React.FC<Props> = React.memo(({ account, summaries, transactions, onBack }) => {
  const accountTxs = useMemo(() => transactions.filter((t) => t.account === account), [transactions, account]);
  const isProcessor = summaries.length > 0 && summaries[0].tier === 'PROCESSOR';

  const { data: stripeBalance } = useQuery({
    queryKey: ['stripe-balance', account],
    queryFn: async () => {
      const { data } = await supabase
        .from('stripe_connections')
        .select('balance_available, balance_pending, balance_fetched_at')
        .eq('account_name', account)
        .maybeSingle();
      return data;
    },
    enabled: isProcessor && account.toLowerCase().includes('stripe'),
  });

  const { transferVolume, totalInflow, totalOutflow } = useMemo(() => {
    let transfers = 0, inflow = 0, outflow = 0;
    accountTxs.forEach((t) => {
      const eur = toEUR(t.amount, t.currency);
      if (t.type === 'Transfer') transfers += eur;
      else if (t.type === 'Inflow') inflow += eur;
      else if (t.type === 'Outflow') outflow += eur;
    });
    return { transferVolume: transfers, totalInflow: inflow, totalOutflow: outflow };
  }, [accountTxs]);
  const netRevenueProcessed = totalInflow - totalOutflow;
  const monthlyFlows = useMemo(() => computeMonthlyFlows(accountTxs), [accountTxs]);
  const categoryBreakdown = useMemo(() => computeCategoryBreakdown(accountTxs), [accountTxs]);
  const recentTxs = useMemo(
    () => [...accountTxs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10),
    [accountTxs]
  );

  const hasApiBalance = stripeBalance?.balance_available != null;

  const kpiCardClass = "border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]";

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={16} />
        All Portfolios
      </button>

      <h2 className="text-xl font-bold text-foreground">{account}</h2>

      {summaries.length > 0 && (
        <div className="space-y-3">
          {summaries.map((summary) => (
            <div key={`${summary.account}-${summary.currency}`}>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em] mb-2">
                {summary.currency} Liquidity
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Card className={kpiCardClass}>
                  <CardContent className="p-5">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">Balance</p>
                    {hasApiBalance ? (
                      <>
                        <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">
                          {formatEUR((stripeBalance.balance_available ?? 0) + (stripeBalance.balance_pending ?? 0))}
                        </p>
                        <p className="text-[13px] text-muted-foreground">
                          Available: {formatEUR(stripeBalance.balance_available ?? 0)} · Pending: {formatEUR(stripeBalance.balance_pending ?? 0)}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">
                          {formatAmount(summary.total, summary.currency)}
                        </p>
                        <p className="text-[13px] text-muted-foreground">≈ {formatEUR(toEUR(summary.total, summary.currency))}</p>
                      </>
                    )}
                  </CardContent>
                </Card>
                <Card className={kpiCardClass}>
                  <CardContent className="p-5">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">Available</p>
                    <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">
                      {hasApiBalance ? formatEUR(stripeBalance.balance_available ?? 0) : formatAmount(summary.available, summary.currency)}
                    </p>
                  </CardContent>
                </Card>
                <Card className={kpiCardClass}>
                  <CardContent className="p-5">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">
                      {hasApiBalance ? 'Pending' : 'Reserved'}
                    </p>
                    <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">
                      {hasApiBalance ? formatEUR(stripeBalance.balance_pending ?? 0) : formatAmount(summary.reserved, summary.currency)}
                    </p>
                  </CardContent>
                </Card>
                {transferVolume > 0 && (
                  <Card className={kpiCardClass}>
                    <CardContent className="p-5">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">Transfers</p>
                      <p className="text-2xl font-bold text-primary mt-1 tabular-nums">{formatEUR(transferVolume)}</p>
                      <p className="text-[13px] text-muted-foreground">Pass-through volume</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          ))}

          {transferVolume > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">
                Analytics (EUR equivalent)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card className={kpiCardClass}>
                  <CardContent className="p-5">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">Net Revenue Processed</p>
                    <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{formatEUR(netRevenueProcessed)}</p>
                    <p className="text-[13px] text-muted-foreground">Inflow − Outflow</p>
                  </CardContent>
                </Card>
                <Card className={kpiCardClass}>
                  <CardContent className="p-5">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">Total Transfers</p>
                    <p className="text-2xl font-bold text-primary mt-1 tabular-nums">{formatEUR(transferVolume)}</p>
                    <p className="text-[13px] text-muted-foreground">Pass-through volume (payouts, reserves)</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className={kpiCardClass}>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">
              By Category
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryBreakdown.slice(0, 8)}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    dataKey="amount"
                    nameKey="category"
                    paddingAngle={2}
                  >
                    {categoryBreakdown.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number) => [formatEUR(value), 'Amount']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {categoryBreakdown.slice(0, 8).map((cat, i) => (
                <div key={cat.category} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {cat.category}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className={kpiCardClass}>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">
              Monthly Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyFlows.slice(-8)} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={(m) => m.substring(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} width={50} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(v: number, name: string) => [formatEUR(v), name === 'inflow' ? 'Inflow' : 'Outflow']}
                  />
                  <Bar dataKey="inflow" fill="hsl(var(--color-inflow))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outflow" fill="hsl(var(--color-outflow))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent transactions */}
      <Card className={kpiCardClass}>
        <CardHeader className="pb-2">
          <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">
            Recent Transactions
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recentTxs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No transactions found</p>
          ) : (
            <div className="divide-y divide-border/50">
              {recentTxs.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-1.5 rounded-md ${
                        tx.type === 'Inflow' ? 'bg-[hsl(var(--color-inflow)/0.1)]' : tx.type === 'Transfer' ? 'bg-[hsl(var(--color-transfer)/0.1)]' : 'bg-[hsl(var(--color-outflow)/0.1)]'
                      }`}
                    >
                      {tx.type === 'Inflow' ? (
                        <TrendingUp size={14} className="text-[hsl(var(--color-inflow))]" />
                      ) : tx.type === 'Transfer' ? (
                        <ArrowLeft size={14} className="text-[hsl(var(--color-transfer))]" />
                      ) : (
                        <TrendingDown size={14} className="text-[hsl(var(--color-outflow))]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">{tx.date} · {tx.category}</p>
                    </div>
                  </div>
                  <p
                    className={`text-sm font-semibold whitespace-nowrap tabular-nums ${
                      tx.type === 'Inflow' ? 'text-[hsl(var(--color-inflow))]' : tx.type === 'Transfer' ? 'text-[hsl(var(--color-transfer))]' : 'text-[hsl(var(--color-outflow))]'
                    }`}
                  >
                    {tx.type === 'Inflow' ? '+' : tx.type === 'Transfer' ? '↔' : '-'}
                    {formatAmount(tx.amount, tx.currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

export default AccountDashboard;
