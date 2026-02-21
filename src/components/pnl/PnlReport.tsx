import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DataService } from '@/services/dataService';
import { PnlMonth } from '@/types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Calendar, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

const fmt = (n: number) => new Intl.NumberFormat('en-EU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const kpiCardClass = "border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]";

const PnlReport: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<PnlMonth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    DataService.fetchPnlReport(year)
      .then((d) => {
        const rows = d.map((r: any) => ({ ...r, gross_revenue_eur: Number(r.gross_revenue_eur), net_revenue_eur: Number(r.net_revenue_eur), cogs_eur: Number(r.cogs_eur), gross_profit_eur: Number(r.gross_profit_eur), variable_costs_eur: Number(r.variable_costs_eur), contribution_margin_eur: Number(r.contribution_margin_eur), opex_eur: Number(r.opex_eur), ebitda_eur: Number(r.ebitda_eur), transaction_count: Number(r.transaction_count) }));
        const byMonth = new Map(rows.map((r: PnlMonth) => [r.month, r]));
        const filled: PnlMonth[] = [];
        for (let m = 1; m <= 12; m++) {
          const key = `${year}-${String(m).padStart(2, '0')}`;
          filled.push(byMonth.get(key) || { month: key, gross_revenue_eur: 0, net_revenue_eur: 0, cogs_eur: 0, gross_profit_eur: 0, variable_costs_eur: 0, contribution_margin_eur: 0, opex_eur: 0, ebitda_eur: 0, transaction_count: 0 });
        }
        setData(filled);
      })
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

  const kpiCards = [
    { title: 'Gross Revenue', icon: DollarSign, value: fmt(totals.gross), accentBg: 'bg-primary/10', accentText: 'text-primary' },
    { title: 'Net Revenue', icon: DollarSign, value: fmt(totals.net), subtitle: 'excl. 21% VAT on EUR sales', accentBg: 'bg-primary/10', accentText: 'text-primary' },
    { title: 'EBITDA', icon: totals.ebitda >= 0 ? TrendingUp : TrendingDown, value: fmt(totals.ebitda), subtitle: `Margin: ${fmtPct(ebitdaMargin)}`, valueColor: totals.ebitda >= 0 ? 'text-[hsl(var(--color-inflow))]' : 'text-destructive', accentBg: totals.ebitda >= 0 ? 'bg-[hsl(160_84%_39%/0.1)]' : 'bg-destructive/10', accentText: totals.ebitda >= 0 ? 'text-[hsl(160,84%,39%)]' : 'text-destructive' },
    { title: 'Best Month', icon: Calendar, value: bestMonth?.month || 'N/A', subtitle: bestMonth ? `${fmt(bestMonth.net_revenue_eur)} net` : undefined, accentBg: 'bg-[hsl(38_92%_50%/0.1)]', accentText: 'text-[hsl(38,92%,50%)]' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Profit & Loss</h2>
          <p className="text-[13px] text-muted-foreground">Cash-method P&L converted to EUR</p>
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
              {card.subtitle && <p className="text-[13px] text-muted-foreground mt-1">{card.subtitle}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* P&L Waterfall */}
      <Card className={kpiCardClass}>
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
              <span className={`w-28 text-right font-mono tabular-nums ${row.amount < 0 ? 'text-destructive' : 'text-foreground'}`}>
                {fmt(row.amount)}
              </span>
              <span className="w-16 text-right text-muted-foreground text-xs tabular-nums">
                {row.pct !== null ? fmtPct(row.pct) : ''}
              </span>
              <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${row.amount >= 0 ? 'bg-primary' : 'bg-destructive/60'}`}
                  style={{ width: `${Math.min((Math.abs(row.amount) / maxWaterfall) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Monthly Table */}
      <Card className={kpiCardClass}>
        <CardHeader>
          <CardTitle className="text-base">Monthly P&L</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 border-border hover:bg-transparent">
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background">Month</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">Gross Rev</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">Net Rev</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">COGS</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">Gross Profit</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">Var. Costs</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">Contrib.</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">OpEx</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">EBITDA</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">EBITDA%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((m) => {
                const margin = m.net_revenue_eur > 0 ? (m.ebitda_eur / m.net_revenue_eur) * 100 : 0;
                const isBest = bestMonth?.month === m.month;
                return (
                  <TableRow key={m.month} className={`h-12 border-b border-border/30 hover:bg-background ${isBest ? 'bg-primary/5' : ''}`}>
                    <TableCell className={`font-medium ${isBest ? 'font-bold' : ''}`}>{m.month}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums font-medium">{fmt(m.gross_revenue_eur)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums font-medium">{fmt(m.net_revenue_eur)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">{fmt(m.cogs_eur)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums font-medium">{fmt(m.gross_profit_eur)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">{fmt(m.variable_costs_eur)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums font-medium">{fmt(m.contribution_margin_eur)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">{fmt(m.opex_eur)}</TableCell>
                    <TableCell className={`text-right font-mono text-sm tabular-nums font-semibold ${m.ebitda_eur >= 0 ? 'text-[hsl(var(--color-inflow))]' : 'text-destructive'}`}>
                      {fmt(m.ebitda_eur)}
                    </TableCell>
                    <TableCell className={`text-right text-sm tabular-nums ${m.ebitda_eur >= 0 ? 'text-[hsl(var(--color-inflow))]' : 'text-destructive'}`}>
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
      <Card className={kpiCardClass}>
        <CardHeader>
          <CardTitle className="text-base">EBITDA Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.map((m) => ({ month: m.month.slice(5), ebitda: m.ebitda_eur }))}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
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
