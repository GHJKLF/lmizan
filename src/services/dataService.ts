import { Transaction, Currency, TransactionType, DashboardData } from '@/types';
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
  async fetchDashboardData(): Promise<DashboardData> {
    // First fetch balances and cash flow in parallel
    const [balancesRes, flowsRes] = await Promise.all([
      supabase.rpc('get_account_balances'),
      supabase.rpc('get_monthly_cash_flow'),
    ]);

    // Compute current equity from balances, then pass to equity trend RPC
    const currentEquity = (balancesRes.data || []).reduce(
      (sum: number, r: any) => sum + (Number(r.balance_eur) || 0), 0
    );
    const equityRes = await supabase.rpc('get_equity_trend', {
      p_current_equity: currentEquity,
    });

    return {
      accountBalances: (balancesRes.data || []).map((r: any) => ({
        account: r.account,
        currency: r.currency,
        total: Number(r.total),
        available: Number(r.available),
        reserved: Number(r.reserved),
        tier: r.tier,
        balance_eur: Number(r.balance_eur),
        last_updated: r.last_updated,
      })),
      equityTrend: (equityRes.data || []).map((r: any) => ({
        date: r.date,
        equity: Number(r.equity),
      })),
      monthlyFlows: (flowsRes.data || []).map((r: any) => ({
        month: r.month,
        inflow: Number(r.inflow),
        outflow: Number(r.outflow),
        net: Number(r.net),
      })),
    };
  },

  async fetchTransactions(): Promise<Transaction[]> {
    let allRows: any[] = [];
    let from = 0;
    const batchSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .range(from, from + batchSize - 1);

      if (error) {
        console.error('Error fetching transactions batch:', error);
        break;
      }

      if (!data || data.length === 0) break;

      allRows = allRows.concat(data);
      from += batchSize;

      if (data.length < batchSize) break;
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

  async fetchAccountTransactions(account: string): Promise<Transaction[]> {
    const allRows: any[] = [];
    const batchSize = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('account', account)
        .order('date', { ascending: false })
        .range(from, from + batchSize - 1);

      if (error) {
        console.error('Error fetching account transactions:', error);
        break;
      }
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < batchSize) break;
      from += batchSize;
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

  async runAnomalyDetection(): Promise<{ checked: number; anomalies_found: number; auto_resolved: number }> {
    const { data, error } = await supabase.rpc('run_anomaly_detection' as any);
    if (error) throw error;
    return data as any;
  },

  async fetchAnomalies(showAll: boolean = false): Promise<any[]> {
    let query = supabase
      .from('account_anomalies' as any)
      .select('*')
      .order('detected_date', { ascending: false })
      .order('severity', { ascending: true });
    if (!showAll) {
      query = query.eq('status', 'open');
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as any[];
  },

  async updateAnomalyStatus(id: string, status: 'dismissed' | 'expected' | 'resolved'): Promise<void> {
    const { error } = await supabase
      .from('account_anomalies' as any)
      .update({ status } as any)
      .eq('id', id);
    if (error) throw error;
  },

  async factoryReset(): Promise<void> {
    localStorage.removeItem(LS_TX_KEY);
    localStorage.removeItem(LS_ACCOUNTS_KEY);
    localStorage.removeItem(LS_MAPPINGS_KEY);
  },

  async fixLiquidityData(): Promise<void> {
    // No-op when authenticated — data is always in DB
  },

  async fetchPnlReport(year: number): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_pnl_report' as any, { p_year: year });
    if (error) throw error;
    return (data || []) as any[];
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
