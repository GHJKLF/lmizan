import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatEUR } from '@/services/balanceEngine';
import { FX_RATES } from '@/constants';
import { DashboardAccountBalance } from '@/types';
import { TrendingUp, TrendingDown, Scale, AlertTriangle, Shield, Landmark } from 'lucide-react';

interface EquityDashboardProps {
  accountBalances: DashboardAccountBalance[];
}

const TIER_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  LIQUID_BANK: { bg: 'bg-[#EEF2FF]', text: 'text-[#4338CA]', label: 'Bank' },
  PROCESSOR: { bg: 'bg-[#F5F3FF]', text: 'text-[#7C3AED]', label: 'Processor' },
  ASSET: { bg: 'bg-[#FFFBEB]', text: 'text-[#B45309]', label: 'Asset' },
};

const kpiCardClass = "border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]";

const EquityDashboard: React.FC<EquityDashboardProps> = ({ accountBalances }) => {
  const cutoffDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return d.toISOString().split('T')[0];
  }, []);

  const { data: vatData } = useQuery({
    queryKey: ['equity-vat', cutoffDate],
    queryFn: async () => {
      let allRows: { amount: number }[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('transactions')
          .select('amount')
          .eq('type', 'Inflow')
          .eq('currency', 'EUR')
          .gte('date', cutoffDate)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data as { amount: number }[]);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      const totalRevenue = allRows.reduce((s, r) => s + (r.amount || 0), 0);
      return { revenue: totalRevenue, vat: totalRevenue * 0.21 };
    },
  });

  const { data: disputeData } = useQuery({
    queryKey: ['equity-disputes', cutoffDate],
    queryFn: async () => {
      let allRows: { amount: number; currency: string }[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('transactions')
          .select('amount, currency')
          .eq('type', 'Outflow')
          .gte('date', cutoffDate)
          .or('description.ilike.%dispute%,description.ilike.%chargeback%,description.ilike.%reversal%')
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data as { amount: number; currency: string }[]);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      const totalEur = allRows.reduce((s, r) => {
        const rate = FX_RATES[r.currency] ?? 1;
        return s + (r.amount || 0) * rate;
      }, 0);
      return { count: allRows.length, total: totalEur };
    },
  });

  const totalAssets = useMemo(() => accountBalances.reduce((s, a) => s + a.balance_eur, 0), [accountBalances]);
  const totalLiabilities = (vatData?.vat || 0) + (disputeData?.total || 0);
  const netWorth = totalAssets - totalLiabilities;
  const liabilityRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

  const sortedBalances = useMemo(() => [...accountBalances].sort((a, b) => b.balance_eur - a.balance_eur), [accountBalances]);

  const kpiCards = [
    { title: 'Total Assets', value: formatEUR(totalAssets), icon: TrendingUp, accentBg: 'bg-[hsl(160_84%_39%/0.1)]', accentText: 'text-[hsl(160,84%,39%)]' },
    { title: 'Total Liabilities', value: formatEUR(totalLiabilities), icon: TrendingDown, accentBg: 'bg-[hsl(0_84%_60%/0.1)]', accentText: 'text-[hsl(0,84%,60%)]' },
    { title: 'Net Worth', value: formatEUR(netWorth), icon: Scale, accentBg: 'bg-primary/10', accentText: 'text-primary', valueColor: netWorth >= 0 ? 'text-[hsl(var(--color-inflow))]' : 'text-destructive' },
    { title: 'Liabilities / Assets', value: `${liabilityRatio.toFixed(1)}%`, icon: AlertTriangle, accentBg: 'bg-[hsl(38_92%_50%/0.1)]', accentText: 'text-[hsl(38,92%,50%)]' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Balance Sheet</h2>
        <p className="text-[13px] text-muted-foreground mt-1">Equity overview and asset breakdown</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Card key={card.title} className={kpiCardClass}>
            <CardContent className="p-5 px-6">
              <div className="flex items-start justify-between mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{card.title}</p>
                <div className={`p-2 rounded-lg ${card.accentBg}`}>
                  <card.icon size={18} className={card.accentText} />
                </div>
              </div>
              <p className={`text-4xl font-bold tabular-nums ${card.valueColor || 'text-foreground'}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Liabilities Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className={kpiCardClass}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Landmark size={16} className="text-muted-foreground" />
              <CardTitle className="text-base">VAT Payable (Estimated)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">EUR Revenue Base (12m)</span>
              <span className="font-medium text-foreground tabular-nums">{formatEUR(vatData?.revenue || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Estimated VAT (21%)</span>
              <span className="font-bold text-foreground tabular-nums">{formatEUR(vatData?.vat || 0)}</span>
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t border-border">
              Estimate only — actual VAT depends on jurisdiction rules
            </p>
          </CardContent>
        </Card>

        <Card className={kpiCardClass}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-muted-foreground" />
              <CardTitle className="text-base">Disputes / Chargebacks Reserve</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Dispute Transactions (12m)</span>
              <span className="font-medium text-foreground tabular-nums">{disputeData?.count || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Reserved (EUR)</span>
              <span className="font-bold text-foreground tabular-nums">{formatEUR(disputeData?.total || 0)}</span>
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t border-border">
              Active dispute exposure (last 12 months)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Asset Breakdown Table */}
      <Card className={kpiCardClass}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Asset Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 border-border hover:bg-transparent">
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background">Account</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background">Currency</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">Balance (Native)</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">Balance (EUR)</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">% of Total</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background">Tier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedBalances.map((ab) => {
                const pct = totalAssets > 0 ? (ab.balance_eur / totalAssets) * 100 : 0;
                const tierConfig = TIER_BADGES[ab.tier] || { bg: 'bg-muted', text: 'text-muted-foreground', label: ab.tier };
                return (
                  <TableRow key={`${ab.account}-${ab.currency}`} className="h-12 border-b border-border/30 hover:bg-background">
                    <TableCell className="font-medium text-sm">{ab.account}</TableCell>
                    <TableCell className="text-sm">{ab.currency}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums font-medium">
                      {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ab.total)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums font-medium">{formatEUR(ab.balance_eur)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{pct.toFixed(1)}%</TableCell>
                    <TableCell>
                      <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded ${tierConfig.bg} ${tierConfig.text}`}>
                        {tierConfig.label}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default EquityDashboard;
