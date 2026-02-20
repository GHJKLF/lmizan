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

const EquityDashboard: React.FC<EquityDashboardProps> = ({ accountBalances }) => {
  const cutoffDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return d.toISOString().split('T')[0];
  }, []);

  // VAT query: sum EUR inflows from last 12 months
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

  // Disputes query: outflows matching dispute/chargeback/reversal
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

  const totalAssets = useMemo(
    () => accountBalances.reduce((s, a) => s + a.balance_eur, 0),
    [accountBalances]
  );

  const totalLiabilities = (vatData?.vat || 0) + (disputeData?.total || 0);
  const netWorth = totalAssets - totalLiabilities;
  const liabilityRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

  const sortedBalances = useMemo(
    () => [...accountBalances].sort((a, b) => b.balance_eur - a.balance_eur),
    [accountBalances]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Balance Sheet</h2>
        <p className="text-sm text-muted-foreground mt-1">Equity overview and asset breakdown</p>
      </div>

      {/* Section 1: Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <TrendingUp size={18} className="text-emerald-500" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Total Assets</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatEUR(totalAssets)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-red-500/10">
                <TrendingDown size={18} className="text-red-500" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Total Liabilities</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatEUR(totalLiabilities)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Scale size={18} className="text-blue-500" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Net Worth</span>
            </div>
            <p className={`text-2xl font-bold ${netWorth >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatEUR(netWorth)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle size={18} className="text-amber-500" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Liabilities / Assets</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{liabilityRatio.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: Liabilities Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Landmark size={16} className="text-muted-foreground" />
              <CardTitle className="text-base">VAT Payable (Estimated)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">EUR Revenue Base (12m)</span>
              <span className="font-medium text-foreground">{formatEUR(vatData?.revenue || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Estimated VAT (21%)</span>
              <span className="font-bold text-foreground">{formatEUR(vatData?.vat || 0)}</span>
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t border-border">
              Estimate only — actual VAT depends on jurisdiction rules
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-muted-foreground" />
              <CardTitle className="text-base">Disputes / Chargebacks Reserve</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Dispute Transactions (12m)</span>
              <span className="font-medium text-foreground">{disputeData?.count || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Reserved (EUR)</span>
              <span className="font-bold text-foreground">{formatEUR(disputeData?.total || 0)}</span>
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t border-border">
              Active dispute exposure (last 12 months)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Section 3: Asset Breakdown Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Asset Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Balance (Native)</TableHead>
                <TableHead className="text-right">Balance (EUR)</TableHead>
                <TableHead className="text-right">% of Total</TableHead>
                <TableHead>Tier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedBalances.map((ab) => {
                const pct = totalAssets > 0 ? (ab.balance_eur / totalAssets) * 100 : 0;
                return (
                  <TableRow key={`${ab.account}-${ab.currency}`}>
                    <TableCell className="font-medium">{ab.account}</TableCell>
                    <TableCell>{ab.currency}</TableCell>
                    <TableCell className="text-right font-mono">
                      {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ab.total)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatEUR(ab.balance_eur)}</TableCell>
                    <TableCell className="text-right font-mono">{pct.toFixed(1)}%</TableCell>
                    <TableCell>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        ab.tier === 'LIQUID_BANK' ? 'bg-emerald-500/10 text-emerald-600' :
                        ab.tier === 'PROCESSOR' ? 'bg-blue-500/10 text-blue-600' :
                        'bg-purple-500/10 text-purple-600'
                      }`}>
                        {ab.tier === 'LIQUID_BANK' ? 'Bank' : ab.tier === 'PROCESSOR' ? 'Processor' : 'Asset'}
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
