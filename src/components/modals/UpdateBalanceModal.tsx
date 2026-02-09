import React, { useState, useMemo } from 'react';
import { Transaction, Currency, TransactionType } from '@/types';
import { ACCOUNTS } from '@/constants';
import { DataService } from '@/services/dataService';
import { computeAccountSummaries, formatAmount } from '@/services/balanceEngine';
import { toast } from 'sonner';
import { X, Loader2, AlertTriangle, Scale } from 'lucide-react';

interface Props {
  transactions: Transaction[];
  open: boolean;
  onClose: () => void;
  onComplete: () => Promise<void>;
}

const UpdateBalanceModal: React.FC<Props> = ({ transactions, open, onClose, onComplete }) => {
  const [selectedAccount, setSelectedAccount] = useState(ACCOUNTS[0]);
  const [actualBalance, setActualBalance] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const summaries = useMemo(() => computeAccountSummaries(transactions), [transactions]);

  const currentSummary = useMemo(
    () => summaries.find((s) => s.account === selectedAccount),
    [summaries, selectedAccount]
  );

  const currentBalance = currentSummary?.total ?? 0;
  const currency = currentSummary?.currency ?? Currency.EUR;
  const enteredBalance = parseFloat(actualBalance) || 0;
  const discrepancy = enteredBalance - currentBalance;

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actualBalance || discrepancy === 0) return;

    setIsLoading(true);
    try {
      const adjustmentTx: Transaction = {
        id: crypto.randomUUID(),
        date: new Date().toISOString().split('T')[0],
        description: discrepancy > 0 ? 'Balance Adjustment (Credit)' : 'Balance Adjustment (Debit)',
        category: 'Other',
        amount: Math.abs(discrepancy),
        currency,
        account: selectedAccount,
        type: discrepancy > 0 ? TransactionType.INFLOW : TransactionType.OUTFLOW,
        runningBalance: enteredBalance,
        balanceAvailable: enteredBalance,
        balanceReserved: 0,
        notes: `Balance correction: ${formatAmount(currentBalance, currency)} → ${formatAmount(enteredBalance, currency)}`,
      };

      await DataService.addTransaction(adjustmentTx);
      toast.success(`Balance updated for ${selectedAccount}`);
      await onComplete();
      setActualBalance('');
      onClose();
    } catch {
      toast.error('Failed to update balance');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Scale size={20} className="text-primary" />
            <h2 className="font-bold text-foreground">Update Balance</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Account</label>
            <select
              value={selectedAccount}
              onChange={(e) => { setSelectedAccount(e.target.value); setActualBalance(''); }}
              className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background"
            >
              {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="p-3 bg-muted rounded-lg space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">System Balance</span>
              <span className="font-semibold text-foreground">{formatAmount(currentBalance, currency)}</span>
            </div>
            {currentSummary && (
              <p className="text-xs text-muted-foreground">Last updated: {currentSummary.lastUpdated}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Actual Balance</label>
            <input
              type="number"
              step="0.01"
              value={actualBalance}
              onChange={(e) => setActualBalance(e.target.value)}
              placeholder="Enter actual balance"
              className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {actualBalance && discrepancy !== 0 && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${discrepancy > 0 ? 'bg-emerald-500/10 text-emerald-700' : 'bg-destructive/10 text-destructive'}`}>
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">
                  Discrepancy: {discrepancy > 0 ? '+' : ''}{formatAmount(discrepancy, currency)}
                </p>
                <p className="text-xs mt-0.5 opacity-80">
                  An adjustment transaction will be created to reconcile the balance.
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !actualBalance || discrepancy === 0}
              className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            >
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              Apply Correction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UpdateBalanceModal;
