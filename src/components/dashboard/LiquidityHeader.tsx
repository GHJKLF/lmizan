import React from 'react';
import { TrendingUp, Shield, Landmark } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { LiquiditySnapshot, formatEUR } from '@/services/balanceEngine';

interface Props {
  snapshot: LiquiditySnapshot;
}

const LiquidityHeader: React.FC<Props> = ({ snapshot }) => {
  const cards = [
    {
      title: 'Total Liquid Cash',
      value: formatEUR(snapshot.totalLiquidCash),
      subtitle: 'Available across all liquid accounts',
      icon: TrendingUp,
      accent: 'hsl(var(--chart-1))',
    },
    {
      title: 'Reserved Funds',
      value: formatEUR(snapshot.totalReserved),
      subtitle: `${snapshot.reservedPercentage.toFixed(1)}% of liquid cash`,
      icon: Shield,
      accent: 'hsl(var(--chart-2))',
      showBar: true,
    },
    {
      title: 'Total Business Equity',
      value: formatEUR(snapshot.totalEquity),
      subtitle: `Liquid: ${formatEUR(snapshot.liquidAssets)} · Fixed: ${formatEUR(snapshot.fixedAssets)}`,
      icon: Landmark,
      accent: 'hsl(var(--chart-3))',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map((card) => (
        <Card key={card.title} className="border-border/60 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.title}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{card.value}</p>
              </div>
              <div
                className="p-2.5 rounded-xl"
                style={{ backgroundColor: `${card.accent}15` }}
              >
                <card.icon size={20} style={{ color: card.accent }} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{card.subtitle}</p>
            {card.showBar && (
              <Progress value={snapshot.reservedPercentage} className="mt-3 h-1.5" />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default LiquidityHeader;
