import React from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DashboardMonthlyFlow } from '@/types';
import { formatEUR } from '@/services/balanceEngine';

interface Props {
  data: DashboardMonthlyFlow[];
}

const CashFlowChart: React.FC<Props> = React.memo(({ data }) => {
  const recent = data.slice(-12);

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-[0_2px_8px_rgba(11,20,55,0.06)]">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em] mb-4">Cash Flow (Monthly)</p>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={recent} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: 'hsl(var(--color-text-3))' }}
              tickFormatter={(m) => m.substring(5)}
              axisLine={{ stroke: 'hsl(var(--border))' }}
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
              formatter={(value: number, name: string) => [formatEUR(value), name === 'inflow' ? 'Inflow' : 'Outflow']}
            />
            <Bar dataKey="inflow" fill="hsl(var(--color-emerald))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="outflow" fill="hsl(var(--color-red))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-2.5 h-2.5 rounded-sm bg-[hsl(var(--color-emerald))]" />Inflow
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-2.5 h-2.5 rounded-sm bg-[hsl(var(--color-red))]" />Outflow
        </div>
      </div>
    </div>
  );
});

export default CashFlowChart;
