import React, { useMemo } from 'react';
import { Transaction } from '@/types';
import { formatEUR, formatAmount, toEUR } from '@/services/balanceEngine';
import { AccountSummary } from '@/types';
import { ArrowLeft, TrendingUp, TrendingDown, Wallet } from 'lucide-react';

interface Props {
  account: string;
  summaries: AccountSummary[];
  transactions: Transaction[];
  onBack: () => void;
}

const AccountDetail: React.FC<Props> = ({ account, summaries, transactions, onBack }) => {
  const summary = summaries.find((s) => s.account === account) || summaries[0];
  const accountTxs = transactions.filter((t) => t.account === account);
  const totalInflow = useMemo(() => accountTxs.filter((t) => t.type === 'Inflow').reduce((s, t) => s + toEUR(t.amount, t.currency), 0), [accountTxs]);
  const totalOutflow = useMemo(() => accountTxs.filter((t) => t.type === 'Outflow').reduce((s, t) => s + toEUR(t.amount, t.currency), 0), [accountTxs]);

  const cards = [
    { label: 'Balance', value: summary ? formatAmount(summary.total, summary.currency) : '€0', icon: Wallet, accentBg: 'bg-primary/10', accentText: 'text-primary' },
    { label: 'Total Inflow', value: formatEUR(totalInflow), icon: TrendingUp, accentBg: 'bg-[hsl(var(--color-emerald)/0.1)]', accentText: 'text-[hsl(var(--color-emerald))]', valueColor: 'text-[hsl(var(--color-emerald))]' },
    { label: 'Total Outflow', value: formatEUR(totalOutflow), icon: TrendingDown, accentBg: 'bg-[hsl(var(--color-red)/0.1)]', accentText: 'text-[hsl(var(--color-red))]', valueColor: 'text-[hsl(var(--color-red))]' },
  ];

  const sorted = [...accountTxs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={16} />
        All Accounts
      </button>

      <h2 className="text-2xl font-bold text-foreground">{account}</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {cards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-2xl p-6 shadow-[0_2px_8px_rgba(11,20,55,0.06)]">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{card.label}</p>
              <div className={`p-2 rounded-lg ${card.accentBg}`}><card.icon size={18} className={card.accentText} /></div>
            </div>
            <p className={`text-3xl font-bold tabular-nums ${card.valueColor || 'text-foreground'}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Recent transactions */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(11,20,55,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Recent Transactions</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-border bg-background">
              <th className="text-left px-6 py-3 text-[11px] uppercase tracking-[0.05em] text-muted-foreground font-semibold">Date</th>
              <th className="text-left px-3 py-3 text-[11px] uppercase tracking-[0.05em] text-muted-foreground font-semibold">Description</th>
              <th className="text-left px-3 py-3 text-[11px] uppercase tracking-[0.05em] text-muted-foreground font-semibold">Category</th>
              <th className="text-right px-6 py-3 text-[11px] uppercase tracking-[0.05em] text-muted-foreground font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tx) => (
              <tr key={tx.id} className="border-b border-border/30 hover:bg-accent/30 h-[48px]">
                <td className="px-6 py-2 text-sm whitespace-nowrap">{tx.date}</td>
                <td className="px-3 py-2 text-sm truncate max-w-[200px]">{tx.description}</td>
                <td className="px-3 py-2 text-sm text-muted-foreground">{tx.category}</td>
                <td className={`px-6 py-2 text-right tabular-nums font-semibold ${tx.type === 'Inflow' ? 'text-[hsl(var(--color-emerald))]' : tx.type === 'Outflow' ? 'text-[hsl(var(--color-red))]' : 'text-[hsl(var(--color-amber))]'}`}>
                  {tx.type === 'Outflow' ? '-' : ''}{formatAmount(tx.amount, tx.currency)}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No transactions</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccountDetail;
