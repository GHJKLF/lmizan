import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountBreakdownItem, formatEUR, formatAmount } from '@/services/balanceEngine';

interface Props {
  data: AccountBreakdownItem[];
  onSelectAccount: (account: string) => void;
}

const TIER_COLORS: Record<string, string> = {
  LIQUID_BANK: 'hsl(var(--chart-1))',
  PROCESSOR: 'hsl(var(--chart-3))',
  ASSET: 'hsl(var(--chart-4))',
};

const AccountBreakdown: React.FC<Props> = ({ data, onSelectAccount }) => {
  const top = data.slice(0, 15);

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Account Balances (EUR)
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <XAxis
                type="number"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                className="fill-muted-foreground"
              />
              <YAxis
                dataKey="account"
                type="category"
                width={130}
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
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
                {top.map((entry) => (
                  <Cell key={entry.account} fill={TIER_COLORS[entry.tier] || 'hsl(var(--chart-5))'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountBreakdown;
