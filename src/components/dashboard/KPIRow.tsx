import React from 'react';
import { LiquiditySnapshot, formatEUR } from '@/services/balanceEngine';
import { DashboardMonthlyFlow } from '@/types';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';

interface Props {
  snapshot: LiquiditySnapshot;
  monthlyFlows: DashboardMonthlyFlow[];
}

const KPIRow: React.FC<Props> = ({ snapshot, monthlyFlows }) => {
  const lastMonth = monthlyFlows.length > 0 ? monthlyFlows[monthlyFlows.length - 1] : null;

  const cards = [
    {
      label: 'Total Equity',
      value: formatEUR(snapshot.totalEquity),
      icon: Wallet,
      accentBg: 'bg-primary/10',
      accentText: 'text-primary',
    },
    {
      label: 'Monthly Inflow',
      value: formatEUR(lastMonth?.inflow ?? 0),
      icon: TrendingUp,
      accentBg: 'bg-[hsl(var(--color-emerald)/0.1)]',
      accentText: 'text-[hsl(var(--color-emerald))]',
      valueColor: 'text-[hsl(var(--color-emerald))]',
    },
    {
      label: 'Monthly Outflow',
      value: formatEUR(lastMonth?.outflow ?? 0),
      icon: TrendingDown,
      accentBg: 'bg-[hsl(var(--color-red)/0.1)]',
      accentText: 'text-[hsl(var(--color-red))]',
      valueColor: 'text-[hsl(var(--color-red))]',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {cards.map((card) => (
        <div key={card.label} className="bg-card border border-border rounded-2xl p-6 shadow-[0_2px_8px_rgba(11,20,55,0.06)]">
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{card.label}</p>
            <div className={`p-2 rounded-lg ${card.accentBg}`}>
              <card.icon size={18} className={card.accentText} />
            </div>
          </div>
          <p className={`text-[40px] leading-tight font-extrabold tabular-nums ${card.valueColor || 'text-foreground'}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
};

export default KPIRow;
