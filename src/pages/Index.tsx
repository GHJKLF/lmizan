import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ViewState, Transaction } from '@/types';
import { DataService } from '@/services/dataService';
import { supabase } from '@/integrations/supabase/client';
import AppSidebar from '@/components/AppSidebar';
import Dashboard from '@/components/dashboard/Dashboard';
import TransactionTable from '@/components/transactions/TransactionTable';
import AIInsightsView from '@/components/ai/AIInsightsView';
import ImportModal from '@/components/ai/ImportModal';
import UpdateBalanceModal from '@/components/modals/UpdateBalanceModal';
import SettingsModal from '@/components/modals/SettingsModal';
import PayoutReconciler from '@/components/modals/PayoutReconciler';
import { Upload, Scale, ArrowLeftRight, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const Index: React.FC = () => {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');
  const [selectedAccount, setSelectedAccount] = useState<string | 'ALL'>('ALL');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [txLoading, setTxLoading] = useState(true);

  // Modal states
  const [importOpen, setImportOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reconcilerOpen, setReconcilerOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      let totalInserted = 0;

      // Sync Wise connections
      const { data: wiseConns } = await supabase
        .from('wise_connections')
        .select('id, account_name');
      if (wiseConns && wiseConns.length > 0) {
        for (const conn of wiseConns) {
          const res = await supabase.functions.invoke('wise-sync', {
            body: { wise_connection_id: conn.id, days_back: 90 },
          });
          if (!res.error && res.data) totalInserted += res.data.inserted || 0;
        }
      }

      // Sync PayPal connections
      const { data: paypalConns } = await supabase
        .from('paypal_connections' as any)
        .select('id, account_name');
      if (paypalConns && paypalConns.length > 0) {
        for (const conn of paypalConns as any[]) {
          const res = await supabase.functions.invoke('paypal-sync', {
            body: { connection_id: conn.id },
          });
          if (!res.error && res.data) totalInserted += res.data.synced || 0;
        }
      }

      // Sync Stripe connections
      const { data: stripeConns } = await supabase
        .from('stripe_connections' as any)
        .select('id, account_name');
      if (stripeConns && stripeConns.length > 0) {
        for (const conn of stripeConns as any[]) {
          const res = await supabase.functions.invoke('stripe-sync', {
            body: { connection_id: conn.id },
          });
          if (!res.error && res.data) totalInserted += res.data.synced || 0;
        }
      }

      if (!wiseConns?.length && !paypalConns?.length && !stripeConns?.length) {
        toast.info('No connections configured. Go to Settings to add one.');
      } else {
        toast.success(`Sync complete: ${totalInserted} new transactions`);
      }
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const loadData = useCallback(async () => {
    setTxLoading(true);
    try {
      const [txs, accs] = await Promise.all([
        DataService.fetchTransactions(),
        DataService.fetchAccounts(),
      ]);
      setTransactions(txs);
      setAccounts(accs);
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRenameAccount = async (oldName: string, newName: string) => {
    await DataService.renameAccount(oldName, newName);
    await loadData();
  };

  const handleDeleteAccount = async (accountName: string) => {
    // First delete all transactions for this account
    await supabase.from('transactions').delete().eq('account', accountName);
    // Then delete the account row
    const { data } = await supabase.from('accounts').select('id, name').eq('name', accountName).limit(1);
    if (data && data.length > 0) {
      const { error } = await supabase.from('accounts').delete().eq('id', data[0].id);
      if (error) {
        toast.error('Failed to delete account');
      } else {
        toast.success(`Account "${accountName}" and its transactions deleted`);
        await loadData();
      }
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        selectedAccount={selectedAccount}
        onSelectAccount={setSelectedAccount}
        accounts={accounts}
        onRenameAccount={handleRenameAccount}
        onDeleteAccount={handleDeleteAccount}
        onLogout={async () => { await supabase.auth.signOut(); navigate('/login'); }}
        onOpenSettings={() => navigate('/settings')}
      />

      <main className="flex-1 ml-72 p-6 overflow-auto">
        {/* Action bar */}
        <div className="flex justify-end gap-2 mb-4">
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-foreground border border-border hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync All
          </button>
          <button
            onClick={() => setReconcilerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-foreground border border-border hover:bg-accent rounded-lg transition-colors"
          >
            <ArrowLeftRight size={14} />
            Reconcile
          </button>
          <button
            onClick={() => setBalanceOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-foreground border border-border hover:bg-accent rounded-lg transition-colors"
          >
            <Scale size={14} />
            Update Balance
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-opacity"
          >
            <Upload size={14} />
            Import
          </button>
        </div>

        {/* Dashboard */}
        <div style={{ display: currentView === 'DASHBOARD' ? 'block' : 'none' }}>
          <Dashboard
            transactions={transactions}
            selectedAccount={selectedAccount}
            onSelectAccount={setSelectedAccount}
            loading={txLoading}
          />
        </div>

        {/* Transactions */}
        <div style={{ display: currentView === 'TRANSACTIONS' ? 'block' : 'none' }}>
          <TransactionTable
            transactions={transactions}
            selectedAccount={selectedAccount}
            onRefresh={loadData}
          />
        </div>

        {/* AI Insights */}
        <div style={{ display: currentView === 'AI_INSIGHTS' ? 'block' : 'none' }}>
          <AIInsightsView transactions={transactions} />
        </div>
      </main>

      {/* Modals */}
      <ImportModal transactions={transactions} accounts={accounts} onImportComplete={loadData} open={importOpen} onClose={() => setImportOpen(false)} />
      <UpdateBalanceModal transactions={transactions} open={balanceOpen} onClose={() => setBalanceOpen(false)} onComplete={loadData} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <PayoutReconciler transactions={transactions} open={reconcilerOpen} onClose={() => setReconcilerOpen(false)} />
    </div>
  );
};

export default Index;
