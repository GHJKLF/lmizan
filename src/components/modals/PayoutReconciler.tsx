import React, { useState, useRef, useMemo } from 'react';
import { Transaction, Currency } from '@/types';
import { DataService, PayoutItem, ReconciliationResult } from '@/services/dataService';
import { formatAmount, toEUR, formatEUR } from '@/services/balanceEngine';
import { toast } from 'sonner';
import {
  X,
  Loader2,
  FileText,
  Upload,
  Check,
  AlertTriangle,
  MinusCircle,
  ArrowLeftRight,
} from 'lucide-react';

interface Props {
  transactions: Transaction[];
  open: boolean;
  onClose: () => void;
}

const PayoutReconciler: React.FC<Props> = ({ transactions, open, onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [provider, setProvider] = useState<'Stripe' | 'Wise'>('Stripe');
  const [payouts, setPayouts] = useState<PayoutItem[] | null>(null);
  const [results, setResults] = useState<ReconciliationResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const parseCSV = (text: string): PayoutItem[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const header = lines[0].toLowerCase();
    const rows = lines.slice(1);

    return rows
      .map((line, i) => {
        const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''));

        // Try to detect columns
        let date = '', amount = 0, currency = 'EUR', description = '';

        if (provider === 'Stripe') {
          // Stripe: id, Type, Source, Amount, Fee, Net, Currency, Created, ...
          date = cols[7] || cols[1] || '';
          amount = Math.abs(parseFloat(cols[3] || cols[5] || '0'));
          currency = (cols[6] || 'EUR').toUpperCase();
          description = cols[1] || 'Stripe Payout';
        } else {
          // Wise: date, amount, currency, description, ...
          date = cols[0] || '';
          amount = Math.abs(parseFloat(cols[1] || '0'));
          currency = (cols[2] || 'EUR').toUpperCase();
          description = cols[3] || 'Wise Transfer';
        }

        // Normalize date
        try {
          const d = new Date(date);
          if (!isNaN(d.getTime())) date = d.toISOString().split('T')[0];
        } catch { /* keep as-is */ }

        return {
          id: `payout-${i}-${Date.now()}`,
          amount,
          currency: currency as Currency,
          date,
          description,
          provider,
        };
      })
      .filter((p) => p.amount > 0 && p.date);
  };

  const handleFileLoad = async () => {
    if (!file) return;
    setIsLoading(true);
    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast.error('No valid payouts found in CSV');
        return;
      }
      setPayouts(parsed);
      toast.success(`Found ${parsed.length} payouts`);
    } catch {
      toast.error('Failed to parse CSV');
    } finally {
      setIsLoading(false);
    }
  };

  const runReconciliation = async () => {
    if (!payouts) return;
    setIsLoading(true);
    try {
      // Simple matching: find bank transactions matching payout amounts within ±2 days
      const mappings = DataService.getAccountMappings();
      const reconciled: ReconciliationResult[] = payouts.map((payout) => {
        const targetAccount = mappings[`${payout.provider} ${payout.currency}`];
        if (!targetAccount) {
          return { payoutId: payout.id, status: 'SKIPPED' as const, confidence: 'NONE' as const, details: 'No routing configured' };
        }

        const payoutDate = new Date(payout.date).getTime();
        const candidates = transactions.filter((tx) => {
          if (tx.account !== targetAccount) return false;
          if (tx.type !== 'Inflow') return false;
          const txDate = new Date(tx.date).getTime();
          const dayDiff = Math.abs(txDate - payoutDate) / (1000 * 60 * 60 * 24);
          return dayDiff <= 3;
        });

        // Exact amount match
        const exactMatch = candidates.find(
          (tx) => Math.abs(tx.amount - payout.amount) < 0.01 && tx.currency === payout.currency
        );
        if (exactMatch) {
          return {
            payoutId: payout.id,
            status: 'MATCHED' as const,
            confidence: 'HIGH' as const,
            details: `Matched: ${exactMatch.description} on ${exactMatch.date}`,
          };
        }

        // Fuzzy match (within 5% amount tolerance)
        const fuzzyMatch = candidates.find((tx) => {
          const diff = Math.abs(tx.amount - payout.amount);
          return diff / payout.amount < 0.05;
        });
        if (fuzzyMatch) {
          return {
            payoutId: payout.id,
            status: 'MATCHED' as const,
            confidence: 'LOW' as const,
            details: `Fuzzy: ${fuzzyMatch.description} (${formatAmount(fuzzyMatch.amount, fuzzyMatch.currency)})`,
          };
        }

        // Check if it's an internal transfer
        const isTransfer = candidates.find((tx) => tx.category === 'Transfer');
        if (isTransfer) {
          return {
            payoutId: payout.id,
            status: 'INTERNAL_TRANSFER' as const,
            confidence: 'LOW' as const,
            details: `Transfer: ${isTransfer.description}`,
          };
        }

        return { payoutId: payout.id, status: 'NO_MATCH' as const, confidence: 'NONE' as const, details: 'No matching transaction found' };
      });

      setResults(reconciled);
    } catch {
      toast.error('Reconciliation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const matched = results?.filter((r) => r.status === 'MATCHED').length ?? 0;
  const noMatch = results?.filter((r) => r.status === 'NO_MATCH').length ?? 0;

  const statusIcon = (status: ReconciliationResult['status']) => {
    switch (status) {
      case 'MATCHED': return <Check size={14} className="text-emerald-600" />;
      case 'NO_MATCH': return <MinusCircle size={14} className="text-destructive" />;
      case 'INTERNAL_TRANSFER': return <ArrowLeftRight size={14} className="text-blue-500" />;
      default: return <AlertTriangle size={14} className="text-muted-foreground" />;
    }
  };

  const resetAndClose = () => {
    setFile(null);
    setPayouts(null);
    setResults(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card rounded-xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={20} className="text-primary" />
            <h2 className="font-bold text-foreground">Payout Reconciler</h2>
          </div>
          <button onClick={resetAndClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Step 1: Upload */}
          {!payouts && (
            <>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Provider</label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as 'Stripe' | 'Wise')}
                    className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background"
                  >
                    <option value="Stripe">Stripe</option>
                    <option value="Wise">Wise</option>
                  </select>
                </div>
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <FileText size={28} className="mx-auto mb-2 text-muted-foreground/50" />
                {file ? (
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Upload {provider} payout CSV</p>
                )}
              </div>

              <button
                onClick={handleFileLoad}
                disabled={!file || isLoading}
                className="w-full py-2.5 bg-primary text-primary-foreground font-bold rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                Load Payouts
              </button>
            </>
          )}

          {/* Step 2: Review & Reconcile */}
          {payouts && !results && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">{payouts.length} payouts loaded</p>
                <div className="flex gap-2">
                  <button onClick={() => setPayouts(null)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg">
                    Back
                  </button>
                  <button
                    onClick={runReconciliation}
                    disabled={isLoading}
                    className="px-4 py-1.5 text-xs font-bold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isLoading ? <Loader2 size={12} className="animate-spin" /> : <ArrowLeftRight size={12} />}
                    Reconcile
                  </button>
                </div>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-60">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Date</th>
                        <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Description</th>
                        <th className="px-2 py-2 text-right font-semibold text-muted-foreground">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {payouts.map((p) => (
                        <tr key={p.id}>
                          <td className="px-2 py-1.5 whitespace-nowrap">{p.date}</td>
                          <td className="px-2 py-1.5 truncate max-w-[200px]">{p.description}</td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatAmount(p.amount, p.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Results */}
          {results && payouts && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-500/10 rounded-lg text-center">
                  <p className="text-lg font-bold text-emerald-600">{matched}</p>
                  <p className="text-xs text-muted-foreground">Matched</p>
                </div>
                <div className="p-3 bg-destructive/10 rounded-lg text-center">
                  <p className="text-lg font-bold text-destructive">{noMatch}</p>
                  <p className="text-xs text-muted-foreground">No Match</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-lg font-bold text-foreground">{payouts.length}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Status</th>
                        <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Date</th>
                        <th className="px-2 py-2 text-right font-semibold text-muted-foreground">Amount</th>
                        <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {results.map((r, i) => {
                        const payout = payouts.find((p) => p.id === r.payoutId);
                        return (
                          <tr key={r.payoutId} className={r.status === 'NO_MATCH' ? 'bg-destructive/5' : ''}>
                            <td className="px-2 py-1.5">
                              <span className="flex items-center gap-1">
                                {statusIcon(r.status)}
                                <span className="font-medium">{r.status.replace('_', ' ')}</span>
                              </span>
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{payout?.date}</td>
                            <td className="px-2 py-1.5 text-right whitespace-nowrap">
                              {payout ? formatAmount(payout.amount, payout.currency) : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[200px]" title={r.details}>
                              {r.details}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <button
                onClick={resetAndClose}
                className="w-full py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayoutReconciler;
