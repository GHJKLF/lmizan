import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DataService } from '@/services/dataService';
import { PnlMonth } from '@/types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Calendar, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

const fmt = (n: number) => new Intl.NumberFormat('en-EU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const CURRENCY_COLORS: Record<string, string> = {
  EUR: 'hsl(var(--chart-1))',
  USD: 'hsl(var(--chart-3))',
  HKD: 'hsl(var(--chart-5))',
  GBP: 'hsl(var(--chart-4))',
};

const PnlReport: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<PnlMonth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    DataService.fetchPnlReport(year)
      .then((d) => setData(d.map((r: any) => ({ ...r, gross_revenue_eur: Number(r.gross_revenue_eur), net_revenue_eur: Number(r.net_revenue_eur), cogs_eur: Number(r.cogs_eur), gross_profit_eur: Number(r.gross_profit_eur), variable_costs_eur: Number(r.variable_costs_eur), contribution_margin_eur: Number(r.contribution_margin_eur), opex_eur: Number(r.opex_eur), ebitda_eur: Number(r.ebitda_eur), transaction_count: Number(r.transaction_count) }))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year]);

  const totals = useMemo(() => {
    const t = { gross: 0, net: 0, cogs: 0, grossProfit: 0, variable: 0, contribution: 0, opex: 0, ebitda: 0 };
    data.forEach((m) => { t.gross += m.gross_revenue_eur; t.net += m.net_revenue_eur; t.cogs += m.cogs_eur; t.grossProfit += m.gross_profit_eur; t.variable += m.variable_costs_eur; t.contribution += m.contribution_margin_eur; t.opex += m.opex_eur; t.ebitda += m.ebitda_eur; });
    return t;
  }, [data]);

  const bestMonth = useMemo(() => {
    if (data.length === 0) return null;
    return data.reduce((best, m) => m.net_revenue_eur > best.net_revenue_eur ? m : best, data[0]);
  }, [data]);

  const ebitdaMargin = totals.net > 0 ? (totals.ebitda / totals.net) * 100 : 0;

  // EBITDA chart data only (revenue by currency removed for performance)


  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const waterfall = [
    { label: 'Gross Revenue', amount: totals.gross, pct: null, type: 'total' as const },
    { label: '- VAT (21% EUR sales)', amount: -(totals.gross - totals.net), pct: null, type: 'deduction' as const },
    { label: '= Net Revenue', amount: totals.net, pct: 100, type: 'subtotal' as const },
    { label: '- COGS (fees)', amount: -totals.cogs, pct: totals.net > 0 ? (totals.cogs / totals.net) * 100 : 0, type: 'deduction' as const },
    { label: '= Gross Profit', amount: totals.grossProfit, pct: totals.net > 0 ? (totals.grossProfit / totals.net) * 100 : 0, type: 'subtotal' as const },
    { label: '- Variable Costs', amount: -totals.variable, pct: totals.net > 0 ? (totals.variable / totals.net) * 100 : 0, type: 'deduction' as const },
    { label: '= Contribution Margin', amount: totals.contribution, pct: totals.net > 0 ? (totals.contribution / totals.net) * 100 : 0, type: 'subtotal' as const },
    { label: '- OpEx', amount: -totals.opex, pct: totals.net > 0 ? (totals.opex / totals.net) * 100 : 0, type: 'deduction' as const },
    { label: '= EBITDA', amount: totals.ebitda, pct: totals.net > 0 ? (totals.ebitda / totals.net) * 100 : 0, type: 'result' as const },
  ];

  const maxWaterfall = Math.max(...waterfall.map((w) => Math.abs(w.amount)), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Profit & Loss</h2>
          <p className="text-sm text-muted-foreground">Cash-method P&L converted to EUR</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2022, 2023, 2024, 2025, 2026].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled>
            <Download size={14} className="mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign size={14} /> Gross Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{fmt(totals.gross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign size={14} /> Net Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{fmt(totals.net)}</p>
            <p className="text-xs text-muted-foreground">excl. 21% VAT on EUR sales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {totals.ebitda >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} EBITDA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totals.ebitda >= 0 ? 'text-chart-1' : 'text-destructive'}`}>{fmt(totals.ebitda)}</p>
            <p className="text-xs text-muted-foreground">Margin: {fmtPct(ebitdaMargin)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar size={14} /> Best Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bestMonth ? (
              <>
                <p className="text-2xl font-bold text-foreground">{bestMonth.month}</p>
                <p className="text-xs text-muted-foreground">{fmt(bestMonth.net_revenue_eur)} net</p>
              </>
            ) : (
              <p className="text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* P&L Waterfall */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">P&L Breakdown — {year}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {waterfall.map((row, i) => (
            <div key={i} className={`flex items-center gap-3 py-2 px-3 rounded-lg text-sm ${
              row.type === 'subtotal' ? 'bg-accent/50 font-semibold' : row.type === 'result' ? 'bg-primary/10 font-bold text-base' : ''
            }`}>
              <span className={`w-44 shrink-0 ${row.type === 'deduction' ? 'text-muted-foreground' : 'text-foreground'}`}>
                {row.label}
              </span>
              <span className={`w-28 text-right font-mono ${row.amount < 0 ? 'text-destructive' : 'text-foreground'}`}>
                {fmt(row.amount)}
              </span>
              <span className="w-16 text-right text-muted-foreground text-xs">
                {row.pct !== null ? fmtPct(row.pct) : ''}
              </span>
              <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${row.amount >= 0 ? 'bg-chart-1' : 'bg-destructive/60'}`}
                  style={{ width: `${Math.min((Math.abs(row.amount) / maxWaterfall) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Monthly Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly P&L</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Gross Rev</TableHead>
                <TableHead className="text-right">Net Rev</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Gross Profit</TableHead>
                <TableHead className="text-right">Var. Costs</TableHead>
                <TableHead className="text-right">Contrib.</TableHead>
                <TableHead className="text-right">OpEx</TableHead>
                <TableHead className="text-right">EBITDA</TableHead>
                <TableHead className="text-right">EBITDA%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((m) => {
                const margin = m.net_revenue_eur > 0 ? (m.ebitda_eur / m.net_revenue_eur) * 100 : 0;
                const isBest = bestMonth?.month === m.month;
                return (
                  <TableRow key={m.month} className={isBest ? 'bg-chart-1/5' : ''}>
                    <TableCell className={`font-medium ${isBest ? 'font-bold' : ''}`}>{m.month}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(m.gross_revenue_eur)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(m.net_revenue_eur)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmt(m.cogs_eur)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(m.gross_profit_eur)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmt(m.variable_costs_eur)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(m.contribution_margin_eur)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmt(m.opex_eur)}</TableCell>
                    <TableCell className={`text-right font-mono text-sm font-semibold ${m.ebitda_eur >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
                      {fmt(m.ebitda_eur)}
                    </TableCell>
                    <TableCell className={`text-right text-sm ${m.ebitda_eur >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
                      {fmtPct(margin)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">No P&L data for {year}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* EBITDA Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">EBITDA Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.map((m) => ({ month: m.month.slice(5), ebitda: m.ebitda_eur }))}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Line type="monotone" dataKey="ebitda" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default PnlReport;
