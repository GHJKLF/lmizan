import { Transaction, Currency, TransactionType } from '@/types';
import { supabase } from '@/integrations/supabase/client';

const LS_TX_KEY = 'imizan_transactions';
const LS_ACCOUNTS_KEY = 'imizan_accounts';
const LS_MAPPINGS_KEY = 'imizan_account_mappings';

// Helpers
export const generateFingerprint = (t: Transaction): string => {
  return `${t.date}-${t.amount}-${t.description?.trim().toLowerCase()}-${t.currency}`;
};

export const generateWeakFingerprint = (t: Transaction): string => {
  return `${t.date}-${t.amount}-${t.currency}`;
};

export const normalizeDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
};

export const recalculateBalances = (transactions: Transaction[]): Transaction[] => {
  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export interface PayoutItem {
  id: string;
  amount: number;
  currency: Currency;
  date: string;
  description: string;
  provider: 'Stripe' | 'Wise';
}

export interface ReconciliationResult {
  payoutId: string;
  status: 'MATCHED' | 'NO_MATCH' | 'INTERNAL_TRANSFER' | 'ALREADY_MATCHED' | 'SKIPPED';
  confidence: 'HIGH' | 'LOW' | 'NONE';
  details?: string;
}

const isAuthenticated = async (): Promise<string | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
};

export const DataService = {
  async fetchTransactions(): Promise<Transaction[]> {
    const batchSize = 5000;
    let offset = 0;
    let allRows: any[] = [];

    while (true) {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .range(offset, offset + batchSize - 1);

      if (error) {
        console.error('Error fetching transactions batch:', error);
        break;
      }

      if (!data || data.length === 0) break;

      allRows = allRows.concat(data);

      if (data.length < batchSize) break;

      offset += batchSize;
    }

    return allRows.map((row: any) => ({
      id: row.id,
      date: row.date,
      description: row.description,
      category: row.category,
      amount: row.amount,
      currency: row.currency as Currency,
      account: row.account,
      type: row.type as TransactionType,
      notes: row.notes,
      runningBalance: row.running_balance,
      balanceAvailable: row.balance_available,
      balanceReserved: row.balance_reserved,
      createdAt: row.created_at,
    }));
  },

  async fetchAccounts(): Promise<string[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('account');
    if (error || !data) {
      console.error('Error fetching accounts from transactions:', error);
      return [];
    }
    const unique = [...new Set(
      data.map((r: any) => r.account as string).filter(Boolean)
    )].sort();
    return unique;
  },

  getAccountMappings(): Record<string, string> {
    const saved = localStorage.getItem(LS_MAPPINGS_KEY);
    return saved ? JSON.parse(saved) : {};
  },

  saveAccountMappings(mappings: Record<string, string>): void {
    localStorage.setItem(LS_MAPPINGS_KEY, JSON.stringify(mappings));
  },

  async addTransaction(tx: Transaction): Promise<Transaction | null> {
    const result = await this.addTransactionsBulk([tx]);
    return result.added > 0 ? tx : null;
  },

  async addTransactionsBulk(txs: Transaction[]): Promise<{ added: number; skipped: number }> {
    if (txs.length === 0) return { added: 0, skipped: 0 };

    const userId = await isAuthenticated();
    if (!userId) return { added: 0, skipped: txs.length };

    const existing = await this.fetchTransactions();
    const existingHashes = new Set(existing.map(generateFingerprint));
    const existingIds = new Set(existing.map((t) => t.id));

    const uniqueTxs = txs.filter((t) => {
      if (existingIds.has(t.id)) return false;
      return !existingHashes.has(generateFingerprint(t));
    });

    const skipped = txs.length - uniqueTxs.length;
    if (uniqueTxs.length === 0) return { added: 0, skipped };

    const normalizedUniqueTxs = uniqueTxs.map((t) => ({
      ...t,
      date: normalizeDate(t.date),
      amount: Math.abs(Number(t.amount) || 0),
    }));

    const CHUNK_SIZE = 1000;
    let addedCount = 0;

    for (let i = 0; i < normalizedUniqueTxs.length; i += CHUNK_SIZE) {
      const chunk = normalizedUniqueTxs.slice(i, i + CHUNK_SIZE);
      const dbPayloads = chunk.map((tx) => {
        const payload: any = {
          id: tx.id,
          date: tx.date,
          description: tx.description,
          category: tx.category,
          amount: tx.amount,
          currency: tx.currency,
          account: tx.account,
          type: tx.type,
          notes: tx.notes || null,
          user_id: userId,
        };
        if (tx.runningBalance !== undefined) payload.running_balance = tx.runningBalance;
        if (tx.balanceAvailable !== undefined) payload.balance_available = tx.balanceAvailable;
        if (tx.balanceReserved !== undefined) payload.balance_reserved = tx.balanceReserved;
        return payload;
      });

      const { error } = await supabase.from('transactions').insert(dbPayloads);
      if (error) {
        console.error('Bulk insert failed for chunk:', error);
      } else {
        addedCount += chunk.length;
      }
    }
    return { added: addedCount, skipped };
  },

  async updateTransaction(tx: Transaction): Promise<boolean> {
    const payload: any = {
      date: tx.date,
      description: tx.description,
      category: tx.category,
      amount: tx.amount,
      currency: tx.currency,
      account: tx.account,
      type: tx.type,
      notes: tx.notes,
      running_balance: tx.runningBalance,
      balance_available: tx.balanceAvailable,
      balance_reserved: tx.balanceReserved,
    };
    const { error } = await supabase.from('transactions').update(payload).eq('id', tx.id);
    return !error;
  },

  async deleteTransaction(id: string): Promise<boolean> {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    return !error;
  },

  async deleteTransactions(ids: string[]): Promise<boolean> {
    const { error } = await supabase.from('transactions').delete().in('id', ids);
    return !error;
  },

  async renameAccount(oldName: string, newName: string): Promise<boolean> {
    const { error } = await supabase
      .from('transactions')
      .update({ account: newName })
      .eq('account', oldName);
    if (error) return false;

    const accounts = await this.fetchAccounts();
    if (!accounts.includes(newName)) {
      const updatedAccounts = accounts.map((a) => (a === oldName ? newName : a));
      localStorage.setItem(LS_ACCOUNTS_KEY, JSON.stringify(updatedAccounts));
    }

    return true;
  },

  async factoryReset(): Promise<void> {
    localStorage.removeItem(LS_TX_KEY);
    localStorage.removeItem(LS_ACCOUNTS_KEY);
    localStorage.removeItem(LS_MAPPINGS_KEY);
  },

  async fixLiquidityData(): Promise<void> {
    // No-op when authenticated — data is always in DB
  },

  async reconcilePayouts(
    payouts: PayoutItem[],
    _provider: string,
    _performSync: boolean
  ): Promise<ReconciliationResult[]> {
    return payouts.map((p) => ({
      payoutId: p.id,
      status: 'NO_MATCH' as const,
      confidence: 'NONE' as const,
      details: 'Feature not fully implemented',
    }));
  },
};
