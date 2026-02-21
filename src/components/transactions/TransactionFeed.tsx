import React, { useState, useMemo } from 'react';
import { Transaction } from '@/types';
import { formatAmount } from '@/services/balanceEngine';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  transactions: Transaction[];
  loading: boolean;
}

const PAGE_SIZE = 50;

const TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  Inflow: { bg: 'bg-[#E6FAF5]', text: 'text-[#065F46]' },
  Outflow: { bg: 'bg-[#FFF0F3]', text: 'text-[#9B1C35]' },
  Transfer: { bg: 'bg-[#FFF8E6]', text: 'text-[#92400E]' },
};

const TransactionFeed: React.FC<Props> = ({ transactions, loading }) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let result = transactions;
    if (typeFilter !== 'All') result = result.filter((t) => t.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => t.description?.toLowerCase().includes(q) || t.account?.toLowerCase().includes(q) || t.category?.toLowerCase().includes(q));
    }
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, typeFilter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const typePills = ['All', 'Inflow', 'Outflow', 'Transfer'];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-1">
          {typePills.map((pill) => (
            <button
              key={pill}
              onClick={() => { setTypeFilter(pill); setPage(0); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                typeFilter === pill
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {pill}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} transactions</span>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(11,20,55,0.06)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-border bg-background">
              <th className="text-left px-6 py-3 text-[11px] uppercase tracking-[0.05em] text-muted-foreground font-semibold">Date</th>
              <th className="text-left px-3 py-3 text-[11px] uppercase tracking-[0.05em] text-muted-foreground font-semibold">Description</th>
              <th className="text-left px-3 py-3 text-[11px] uppercase tracking-[0.05em] text-muted-foreground font-semibold">Account</th>
              <th className="text-left px-3 py-3 text-[11px] uppercase tracking-[0.05em] text-muted-foreground font-semibold">Category</th>
              <th className="text-right px-3 py-3 text-[11px] uppercase tracking-[0.05em] text-muted-foreground font-semibold">Amount</th>
              <th className="text-left px-6 py-3 text-[11px] uppercase tracking-[0.05em] text-muted-foreground font-semibold">Type</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
            ) : pageData.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No transactions found</td></tr>
            ) : (
              pageData.map((tx) => {
                const style = TYPE_STYLES[tx.type] || TYPE_STYLES.Transfer;
                return (
                  <tr key={tx.id} className="border-b border-border/20 hover:bg-accent/30 h-[52px]">
                    <td className="px-6 py-2 whitespace-nowrap">{tx.date}</td>
                    <td className="px-3 py-2 truncate max-w-[250px]" title={tx.description}>{tx.description}</td>
                    <td className="px-3 py-2 text-muted-foreground">{tx.account}</td>
                    <td className="px-3 py-2 text-muted-foreground">{tx.category}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${tx.type === 'Inflow' ? 'text-[hsl(var(--color-emerald))]' : tx.type === 'Outflow' ? 'text-[hsl(var(--color-red))]' : 'text-[hsl(var(--color-amber))]'}`}>
                      {tx.type === 'Outflow' ? '-' : ''}{formatAmount(tx.amount, tx.currency)}
                    </td>
                    <td className="px-6 py-2">
                      <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded ${style.bg} ${style.text}`}>{tx.type}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="p-2 border border-border rounded-lg hover:bg-accent disabled:opacity-30 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="p-2 border border-border rounded-lg hover:bg-accent disabled:opacity-30 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionFeed;
