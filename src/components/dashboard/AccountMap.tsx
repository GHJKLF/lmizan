import React from 'react';
import { AccountBreakdownItem, formatEUR } from '@/services/balanceEngine';

interface Props {
  data: AccountBreakdownItem[];
  onSelectAccount: (account: string) => void;
}

const TIER_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  LIQUID_BANK: { bg: 'bg-[#EEF2FF]', text: 'text-[#4338CA]', label: 'Bank' },
  PROCESSOR: { bg: 'bg-[#F3EEFF]', text: 'text-[#7C3AED]', label: 'Processor' },
  ASSET: { bg: 'bg-[#E6FAF5]', text: 'text-[#065F46]', label: 'Asset' },
};

const TIER_BAR_COLORS: Record<string, string> = {
  LIQUID_BANK: 'bg-[hsl(var(--color-indigo))]',
  PROCESSOR: 'bg-[hsl(263,70%,58%)]',
  ASSET: 'bg-[hsl(var(--color-emerald))]',
};

const AccountMap: React.FC<Props> = ({ data, onSelectAccount }) => {
  const maxBalance = Math.max(...data.map((d) => Math.abs(d.balanceEUR)), 1);

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-[0_2px_8px_rgba(11,20,55,0.06)]">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em] mb-4">Account Balances</p>
      <div className="space-y-1">
        {data.map((item) => {
          const tierConfig = TIER_BADGES[item.tier] || { bg: 'bg-muted', text: 'text-muted-foreground', label: item.tier };
          const barWidth = Math.max((Math.abs(item.balanceEUR) / maxBalance) * 100, 2);

          return (
            <div
              key={item.account}
              onClick={() => onSelectAccount(item.account)}
              className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors group"
            >
              <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-foreground truncate">{item.account}</span>
                  <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded ${tierConfig.bg} ${tierConfig.text}`}>
                    {tierConfig.label}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${TIER_BAR_COLORS[item.tier] || 'bg-primary'}`} style={{ width: `${barWidth}%` }} />
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums text-foreground whitespace-nowrap">{formatEUR(item.balanceEUR)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AccountMap;
