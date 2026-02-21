import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountBreakdownItem, formatEUR, formatAmount } from '@/services/balanceEngine';

interface Props {
  data: AccountBreakdownItem[];
  onSelectAccount: (account: string) => void;
}

const BAR_COLORS = ['#6366F1', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#94A3B8'];

const AccountBreakdown: React.FC<Props> = React.memo(({ data, onSelectAccount }) => {
  const top = data.slice(0, 15);

  return (
    <Card className="border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">
          Account Balances (EUR)
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="account"
                type="category"
                width={130}
                tick={{ fontSize: 12, fill: '#64748B' }}
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
                formatter={(value: number, _: any, item: any) => {
                  const entry = item.payload as AccountBreakdownItem;
                  return [
                    `${formatEUR(value)} (${formatAmount(entry.originalBalance, entry.currency)})`,
                    'Balance',
                  ];
                }}
              />
              <Bar
                dataKey="balanceEUR"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(data: any) => onSelectAccount(data.account)}
              >
                {top.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});

export default AccountBreakdown;
