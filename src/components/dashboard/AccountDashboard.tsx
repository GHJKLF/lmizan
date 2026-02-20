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

const PIE_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(210 60% 60%)',
  'hsl(330 60% 60%)',
  'hsl(50 60% 50%)',
];

const AccountDashboard: React.FC<Props> = React.memo(({ account, summaries, transactions, onBack }) => {
  const accountTxs = useMemo(() => transactions.filter((t) => t.account === account), [transactions, account]);
  const isProcessor = summaries.length > 0 && summaries[0].tier === 'PROCESSOR';

  // Fetch Stripe API balance for processor accounts
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
    () =>
      [...accountTxs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10),
    [accountTxs]
  );

  const hasApiBalance = stripeBalance?.balance_available != null;

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

      {/* Per-currency balance cards */}
      {summaries.length > 0 && (
        <div className="space-y-3">
          {summaries.map((summary) => (
            <div key={`${summary.account}-${summary.currency}`}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {summary.currency} Liquidity
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Card className="border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Balance</p>
                    {hasApiBalance ? (
                      <>
                        <p className="text-xl font-bold text-foreground mt-1">
                          {formatEUR((stripeBalance.balance_available ?? 0) + (stripeBalance.balance_pending ?? 0))}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Available: {formatEUR(stripeBalance.balance_available ?? 0)} · Pending: {formatEUR(stripeBalance.balance_pending ?? 0)}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold text-foreground mt-1">
                          {formatAmount(summary.total, summary.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">≈ {formatEUR(toEUR(summary.total, summary.currency))}</p>
                      </>
                    )}
                  </CardContent>
                </Card>
                <Card className="border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Available</p>
                    <p className="text-xl font-bold text-foreground mt-1">
                      {hasApiBalance ? formatEUR(stripeBalance.balance_available ?? 0) : formatAmount(summary.available, summary.currency)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">
                      {hasApiBalance ? 'Pending' : 'Reserved'}
                    </p>
                    <p className="text-xl font-bold text-foreground mt-1">
                      {hasApiBalance ? formatEUR(stripeBalance.balance_pending ?? 0) : formatAmount(summary.reserved, summary.currency)}
                    </p>
                  </CardContent>
                </Card>
                {transferVolume > 0 && (
                  <Card className="border-border/60">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">Transfers</p>
                      <p className="text-xl font-bold text-primary mt-1">
                        {formatEUR(transferVolume)}
                      </p>
                      <p className="text-xs text-muted-foreground">Pass-through volume</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          ))}

          {/* Analytics section */}
          {transferVolume > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Analytics (EUR equivalent)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card className="border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Net Revenue Processed</p>
                    <p className="text-xl font-bold text-foreground mt-1">
                      {formatEUR(netRevenueProcessed)}
                    </p>
                    <p className="text-xs text-muted-foreground">Inflow − Outflow</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Total Transfers</p>
                    <p className="text-xl font-bold text-primary mt-1">
                      {formatEUR(transferVolume)}
                    </p>
                    <p className="text-xs text-muted-foreground">Pass-through volume (payouts, reserves)</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
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

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Monthly Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyFlows.slice(-8)} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(m) => m.substring(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} width={50} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(v: number, name: string) => [formatEUR(v), name === 'inflow' ? 'Inflow' : 'Outflow']}
                  />
                  <Bar dataKey="inflow" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="outflow" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent transactions */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Recent Transactions
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recentTxs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No transactions found</p>
          ) : (
            <div className="divide-y divide-border">
              {recentTxs.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-1.5 rounded-md ${
                        tx.type === 'Inflow' ? 'bg-emerald-500/10' : tx.type === 'Transfer' ? 'bg-blue-500/10' : 'bg-destructive/10'
                      }`}
                    >
                      {tx.type === 'Inflow' ? (
                        <TrendingUp size={14} className="text-emerald-600" />
                      ) : tx.type === 'Transfer' ? (
                        <ArrowLeft size={14} className="text-blue-500" />
                      ) : (
                        <TrendingDown size={14} className="text-destructive" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.date} · {tx.category}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`text-sm font-semibold whitespace-nowrap ${
                      tx.type === 'Inflow' ? 'text-emerald-600' : tx.type === 'Transfer' ? 'text-blue-500' : 'text-destructive'
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
