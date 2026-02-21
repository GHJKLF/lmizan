import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EquityPoint, formatEUR } from '@/services/balanceEngine';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  data: EquityPoint[];
}

const EquityTrendChart: React.FC<Props> = React.memo(({ data }) => {
  if (data.length === 0) return null;

  const first = data[0].equity;
  const last = data[data.length - 1].equity;
  const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  const isPositive = change >= 0;

  return (
    <Card className="border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">
            Equity Trend
          </CardTitle>
          <div className={`flex items-center gap-1 text-sm font-bold ${isPositive ? 'text-[hsl(var(--color-inflow))]' : 'text-destructive'}`}>
            {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {isPositive ? '+' : ''}{change.toFixed(1)}%
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                tickFormatter={(d) => d.substring(5)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                width={55}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number) => [formatEUR(value), 'Equity']}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                fill="url(#equityGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});

export default EquityTrendChart;
