import React, { useState, useMemo, useCallback } from 'react';
import { Transaction, Currency, TransactionType } from '@/types';
import { CATEGORIES, ACCOUNTS } from '@/constants';
import { DataService } from '@/services/dataService';
import { formatAmount } from '@/services/balanceEngine';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Search,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Check,
  X,
  Loader2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface Props {
  transactions: Transaction[];
  selectedAccount: string | 'ALL';
  onRefresh: () => Promise<void>;
}

type SortField = 'date' | 'description' | 'category' | 'amount' | 'account' | 'type';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

const TransactionTable: React.FC<Props> = ({ transactions, selectedAccount, onRefresh }) => {
  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Sort
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Pagination
  const [page, setPage] = useState(0);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Transaction>>({});

  // Add new
  const [showAdd, setShowAdd] = useState(false);
  const [newTx, setNewTx] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    category: 'Other',
    amount: '',
    currency: Currency.EUR,
    account: ACCOUNTS[0],
    type: TransactionType.OUTFLOW,
  });

  const [actionLoading, setActionLoading] = useState(false);

  // Filter + sort pipeline
  const filtered = useMemo(() => {
    let result = selectedAccount !== 'ALL'
      ? transactions.filter((t) => t.account === selectedAccount)
      : transactions;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.account.toLowerCase().includes(q) ||
          t.notes?.toLowerCase().includes(q)
      );
    }
    if (categoryFilter) result = result.filter((t) => t.category === categoryFilter);
    if (typeFilter) result = result.filter((t) => t.type === typeFilter);
    if (currencyFilter) result = result.filter((t) => t.currency.toUpperCase() === currencyFilter);
    if (dateFrom) result = result.filter((t) => t.date >= dateFrom);
    if (dateTo) result = result.filter((t) => t.date <= dateTo);

    result.sort((a, b) => {
      let cmp = 0;
      const fa = a[sortField];
      const fb = b[sortField];
      if (typeof fa === 'number' && typeof fb === 'number') cmp = fa - fb;
      else cmp = String(fa).localeCompare(String(fb));
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [transactions, selectedAccount, search, categoryFilter, typeFilter, currencyFilter, dateFrom, dateTo, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown size={12} className="text-muted-foreground/50" />;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  // Selection
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === paged.length) setSelected(new Set());
    else setSelected(new Set(paged.map((t) => t.id)));
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setActionLoading(true);
    try {
      await DataService.deleteTransactions(Array.from(selected));
      setSelected(new Set());
      toast.success(`Deleted ${selected.size} transactions`);
      await onRefresh();
    } catch {
      toast.error('Failed to delete transactions');
    } finally {
      setActionLoading(false);
    }
  };

  // Inline edit
  const startEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setEditData({ ...tx });
  };

  const saveEdit = async () => {
    if (!editingId || !editData) return;
    setActionLoading(true);
    try {
      await DataService.updateTransaction(editData as Transaction);
      setEditingId(null);
      toast.success('Transaction updated');
      await onRefresh();
    } catch {
      toast.error('Failed to update');
    } finally {
      setActionLoading(false);
    }
  };

  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  // Add new
  const handleAdd = async () => {
    if (!newTx.description.trim() || !newTx.amount) return;
    setActionLoading(true);
    try {
      const tx: Transaction = {
        id: crypto.randomUUID(),
        date: newTx.date,
        description: newTx.description.trim(),
        category: newTx.category,
        amount: Math.abs(parseFloat(newTx.amount) || 0),
        currency: newTx.currency,
        account: newTx.account,
        type: newTx.type,
      };
      await DataService.addTransaction(tx);
      setShowAdd(false);
      setNewTx({ date: new Date().toISOString().split('T')[0], description: '', category: 'Other', amount: '', currency: Currency.EUR, account: ACCOUNTS[0], type: TransactionType.OUTFLOW });
      toast.success('Transaction added');
      await onRefresh();
    } catch {
      toast.error('Failed to add transaction');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete single
  const handleDelete = async (id: string) => {
    setActionLoading(true);
    try {
      await DataService.deleteTransaction(id);
      toast.success('Transaction deleted');
      await onRefresh();
    } catch {
      toast.error('Failed to delete');
    } finally {
      setActionLoading(false);
    }
  };

  const inputClass = 'px-2 py-1 text-xs border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring';
  const selectClass = `${inputClass} appearance-none`;

  const thClass = 'px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Transactions</h2>
          <p className="text-sm text-muted-foreground">{filtered.length} records{selectedAccount !== 'ALL' ? ` · ${selectedAccount}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors"
            >
              <Trash2 size={14} />
              Delete {selected.size}
            </button>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border/60">
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className={`${inputClass} w-full pl-8`}
              />
            </div>
            <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }} className={selectClass}>
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }} className={selectClass}>
              <option value="">All Types</option>
              <option value="Inflow">Inflow</option>
              <option value="Outflow">Outflow</option>
            </select>
            <select value={currencyFilter} onChange={(e) => { setCurrencyFilter(e.target.value); setPage(0); }} className={selectClass}>
              <option value="">All Currencies</option>
              {Object.values(Currency).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className={inputClass} />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className={inputClass} />
            {(search || categoryFilter || typeFilter || currencyFilter || dateFrom || dateTo) && (
              <button
                onClick={() => { setSearch(''); setCategoryFilter(''); setTypeFilter(''); setCurrencyFilter(''); setDateFrom(''); setDateTo(''); setPage(0); }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Clear
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add row */}
      {showAdd && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-0.5">Date</label>
                <input type="date" value={newTx.date} onChange={(e) => setNewTx((p) => ({ ...p, date: e.target.value }))} className={inputClass} />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-0.5">Description</label>
                <input type="text" value={newTx.description} onChange={(e) => setNewTx((p) => ({ ...p, description: e.target.value }))} className={`${inputClass} w-full`} placeholder="Description" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-0.5">Category</label>
                <select value={newTx.category} onChange={(e) => setNewTx((p) => ({ ...p, category: e.target.value }))} className={selectClass}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-0.5">Amount</label>
                <input type="number" step="0.01" min="0" value={newTx.amount} onChange={(e) => setNewTx((p) => ({ ...p, amount: e.target.value }))} className={`${inputClass} w-24`} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-0.5">Currency</label>
                <select value={newTx.currency} onChange={(e) => setNewTx((p) => ({ ...p, currency: e.target.value as Currency }))} className={selectClass}>
                  {Object.values(Currency).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-0.5">Account</label>
                <select value={newTx.account} onChange={(e) => setNewTx((p) => ({ ...p, account: e.target.value }))} className={selectClass}>
                  {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-0.5">Type</label>
                <select value={newTx.type} onChange={(e) => setNewTx((p) => ({ ...p, type: e.target.value as TransactionType }))} className={selectClass}>
                  <option value="Inflow">Inflow</option>
                  <option value="Outflow">Outflow</option>
                </select>
              </div>
              <button onClick={handleAdd} disabled={actionLoading || !newTx.description.trim() || !newTx.amount} className="px-3 py-1.5 text-xs font-bold text-primary-foreground bg-primary rounded hover:opacity-90 disabled:opacity-50">
                <Check size={14} />
              </button>
              <button onClick={() => setShowAdd(false)} className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={paged.length > 0 && selected.size === paged.length}
                    onChange={toggleSelectAll}
                    className="rounded border-input"
                  />
                </th>
                <th className={thClass} onClick={() => toggleSort('date')}>
                  <span className="flex items-center gap-1">Date <SortIcon field="date" /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort('description')}>
                  <span className="flex items-center gap-1">Description <SortIcon field="description" /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort('category')}>
                  <span className="flex items-center gap-1">Category <SortIcon field="category" /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort('amount')}>
                  <span className="flex items-center gap-1">Amount <SortIcon field="amount" /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort('account')}>
                  <span className="flex items-center gap-1">Account <SortIcon field="account" /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort('type')}>
                  <span className="flex items-center gap-1">Type <SortIcon field="type" /></span>
                </th>
                <th className="px-3 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                    No transactions found
                  </td>
                </tr>
              ) : (
                paged.map((tx) => {
                  const isEditing = editingId === tx.id;

                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-muted/30 transition-colors ${selected.has(tx.id) ? 'bg-primary/5' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(tx.id)}
                          onChange={() => toggleSelect(tx.id)}
                          className="rounded border-input"
                        />
                      </td>

                      {/* Date */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        {isEditing ? (
                          <input type="date" value={editData.date ?? ''} onChange={(e) => setEditData((p) => ({ ...p, date: e.target.value }))} className={inputClass} />
                        ) : (
                          <span className="text-foreground cursor-pointer" onDoubleClick={() => startEdit(tx)}>{tx.date}</span>
                        )}
                      </td>

                      {/* Description */}
                      <td className="px-3 py-2 max-w-[200px]">
                        {isEditing ? (
                          <input type="text" value={editData.description ?? ''} onChange={(e) => setEditData((p) => ({ ...p, description: e.target.value }))} className={`${inputClass} w-full`} />
                        ) : (
                          <span className="text-foreground truncate block cursor-pointer" onDoubleClick={() => startEdit(tx)} title={tx.description}>{tx.description}</span>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select value={editData.category ?? ''} onChange={(e) => setEditData((p) => ({ ...p, category: e.target.value }))} className={selectClass}>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground cursor-pointer" onDoubleClick={() => startEdit(tx)}>{tx.category}</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        {isEditing ? (
                          <input type="number" step="0.01" value={editData.amount ?? 0} onChange={(e) => setEditData((p) => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} className={`${inputClass} w-24 text-right`} />
                        ) : (
                          <span
                            className={`font-medium cursor-pointer ${tx.type === 'Inflow' ? 'text-emerald-600' : 'text-foreground'}`}
                            onDoubleClick={() => startEdit(tx)}
                          >
                            {tx.type === 'Inflow' ? '+' : '-'}{formatAmount(tx.amount, tx.currency)}
                          </span>
                        )}
                      </td>

                      {/* Account */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        {isEditing ? (
                          <select value={editData.account ?? ''} onChange={(e) => setEditData((p) => ({ ...p, account: e.target.value }))} className={selectClass}>
                            {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                          </select>
                        ) : (
                          <span className="text-muted-foreground text-xs cursor-pointer" onDoubleClick={() => startEdit(tx)}>{tx.account}</span>
                        )}
                      </td>

                      {/* Type */}
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select value={editData.type ?? ''} onChange={(e) => setEditData((p) => ({ ...p, type: e.target.value as TransactionType }))} className={selectClass}>
                            <option value="Inflow">Inflow</option>
                            <option value="Outflow">Outflow</option>
                          </select>
                        ) : (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tx.type === 'Inflow' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'}`}>
                            {tx.type}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <button onClick={saveEdit} disabled={actionLoading} className="p-1 text-emerald-600 hover:bg-emerald-500/10 rounded">
                              <Check size={14} />
                            </button>
                            <button onClick={cancelEdit} className="p-1 text-muted-foreground hover:bg-muted rounded">
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDelete(tx.id)}
                            disabled={actionLoading}
                            className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ opacity: undefined }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} · {filtered.length} records
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="p-1.5 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default TransactionTable;
