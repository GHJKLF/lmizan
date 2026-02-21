import React from 'react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { DashboardEquityPoint } from '@/types';
import { formatEUR } from '@/services/balanceEngine';

interface Props {
  data: DashboardEquityPoint[];
}

const EquityChart: React.FC<Props> = React.memo(({ data }) => {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-[0_2px_8px_rgba(11,20,55,0.06)]">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em] mb-4">Equity Trend</p>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--color-indigo))" stopOpacity={0.18} />
                <stop offset="100%" stopColor="hsl(var(--color-indigo))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid horizontal={true} vertical={false} stroke="hsl(var(--border))" strokeDasharray="" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'hsl(var(--color-text-3))' }}
              tickFormatter={(d) => { try { return new Date(d).toLocaleDateString('en', { month: 'short' }); } catch { return d; } }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--color-navy))',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'white',
              }}
              formatter={(value: number) => [formatEUR(value), 'Equity']}
              labelFormatter={(label) => label}
            />
            <Area type="monotone" dataKey="equity" stroke="hsl(var(--color-indigo))" strokeWidth={2.5} fill="url(#equityGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

export default EquityChart;
