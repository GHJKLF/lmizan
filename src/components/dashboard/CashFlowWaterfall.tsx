import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MonthlyFlow, formatEUR } from '@/services/balanceEngine';

interface Props {
  data: MonthlyFlow[];
}

const CashFlowWaterfall: React.FC<Props> = React.memo(({ data }) => {
  const recent = data.slice(-12);

  return (
    <Card className="border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">
          Cash Flow (Monthly)
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={recent} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                tickFormatter={(m) => m.substring(5)}
                axisLine={{ stroke: '#E2E8F0' }}
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
                formatter={(value: number, name: string) => [formatEUR(value), name === 'inflow' ? 'Inflow' : 'Outflow']}
              />
              <Bar dataKey="inflow" fill="hsl(var(--color-inflow))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outflow" fill="hsl(var(--color-outflow))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});

export default CashFlowWaterfall;
