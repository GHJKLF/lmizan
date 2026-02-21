import React from 'react';
import { TrendingUp, Shield, Landmark } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { LiquiditySnapshot, formatEUR } from '@/services/balanceEngine';

interface Props {
  snapshot: LiquiditySnapshot;
}

const LiquidityHeader: React.FC<Props> = React.memo(({ snapshot }) => {
  const cards = [
    {
      title: 'Total Liquid Cash',
      value: formatEUR(snapshot.totalLiquidCash),
      subtitle: 'Available across all liquid accounts',
      icon: TrendingUp,
      accentBg: 'bg-[hsl(160_84%_39%/0.1)]',
      accentText: 'text-[hsl(160,84%,39%)]',
    },
    {
      title: 'Reserved Funds',
      value: formatEUR(snapshot.totalReserved),
      subtitle: `${snapshot.reservedPercentage.toFixed(1)}% of liquid cash`,
      icon: Shield,
      accentBg: 'bg-[hsl(0_84%_60%/0.1)]',
      accentText: 'text-[hsl(0,84%,60%)]',
      showBar: true,
    },
    {
      title: 'Total Business Equity',
      value: formatEUR(snapshot.totalEquity),
      subtitle: `Liquid: ${formatEUR(snapshot.liquidAssets)} · Fixed: ${formatEUR(snapshot.fixedAssets)}`,
      icon: Landmark,
      accentBg: 'bg-primary/10',
      accentText: 'text-primary',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map((card) => (
        <Card key={card.title} className="border-border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
          <CardContent className="p-5 px-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{card.title}</p>
                <p className="text-4xl font-bold text-foreground mt-1 tabular-nums">{card.value}</p>
              </div>
              <div className={`p-2 rounded-lg ${card.accentBg}`}>
                <card.icon size={18} className={card.accentText} />
              </div>
            </div>
            <p className="text-[13px] text-muted-foreground">{card.subtitle}</p>
            {card.showBar && (
              <Progress value={snapshot.reservedPercentage} className="mt-3 h-1.5" />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
});

export default LiquidityHeader;
