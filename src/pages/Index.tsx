import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ViewState, Transaction, DashboardData } from '@/types';
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
import SyncProgress from '@/components/SyncProgress';
import { Upload, Scale, ArrowLeftRight, RefreshCw, Loader2, ChevronDown, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

const Index: React.FC = () => {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');
  const [selectedAccount, setSelectedAccount] = useState<string | 'ALL'>('ALL');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const txLoadedRef = useRef(false);
  const [accountTransactions, setAccountTransactions] = useState<Transaction[]>([]);
  const [accountTxLoading, setAccountTxLoading] = useState(false);

  // Modal states
  const [importOpen, setImportOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reconcilerOpen, setReconcilerOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [anomalyRefreshKey, setAnomalyRefreshKey] = useState(0);
  const [runningAnomalyCheck, setRunningAnomalyCheck] = useState(false);
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const syncMenuRef = useRef<HTMLDivElement>(null);
  const [runningSessions, setRunningSessions] = useState<
    { connection_id: string; provider: string; account_name: string }[]
  >([]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (syncMenuRef.current && !syncMenuRef.current.contains(e.target as Node)) {
        setSyncMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSyncAll = async (fullSync: boolean = false) => {
    setSyncMenuOpen(false);
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
            body: { wise_connection_id: conn.id, full_sync: fullSync },
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
            body: { connection_id: conn.id, full_sync: fullSync },
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
            body: { connection_id: conn.id, full_sync: fullSync },
          });
          if (!res.error && res.data) totalInserted += res.data.synced || 0;
        }
      }

      if (!wiseConns?.length && !paypalConns?.length && !stripeConns?.length) {
        toast.info('No connections configured. Go to Settings to add one.');
      } else {
        toast.success(`Sync complete: ${totalInserted} new transactions`);
      }
      // Refresh both dashboard data and invalidate tx cache
      txLoadedRef.current = false;
      await loadDashboardData();
    } catch (err: any) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const loadDashboardData = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const [dd, accsResult] = await Promise.all([
        DataService.fetchDashboardData(),
        supabase.from('accounts').select('name'),
      ]);
      const accs = (accsResult.data || []).map((r: any) => r.name as string).filter(Boolean).sort();
      setDashboardData(dd);
      setAccounts(accs);
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    if (txLoadedRef.current) return;
    setTxLoading(true);
    try {
      const txs = await DataService.fetchTransactions();
      setTransactions(txs);
      txLoadedRef.current = true;
    } catch (e) {
      console.error('Failed to load transactions:', e);
    } finally {
      setTxLoading(false);
    }
  }, []);

  const loadAccountTransactions = useCallback(async (account: string) => {
    setAccountTxLoading(true);
    setAccountTransactions([]);
    try {
      const txs = await DataService.fetchAccountTransactions(account);
      setAccountTransactions(txs);
    } catch (e) {
      console.error('Failed to load account transactions:', e);
    } finally {
      setAccountTxLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();

    // Fetch running sync sessions
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: sessions } = await supabase
        .from('sync_sessions')
        .select('connection_id, provider')
        .eq('user_id', user.id)
        .eq('status', 'running');
      if (sessions?.length) {
        // Get account names from connections
        const enriched = await Promise.all(
          sessions.map(async (s: any) => {
            const table =
              s.provider === 'paypal' ? 'paypal_connections_safe' :
              s.provider === 'wise' ? 'wise_connections_safe' :
              'stripe_connections_safe';
            const { data } = await supabase
              .from(table)
              .select('account_name')
              .eq('id', s.connection_id)
              .limit(1);
            return {
              connection_id: s.connection_id,
              provider: s.provider,
              account_name: data?.[0]?.account_name || s.provider,
            };
          })
        );
        setRunningSessions(enriched);
      }
    })();
  }, [loadDashboardData]);

  // Lazy-load transactions when navigating to views that need them
  useEffect(() => {
    if ((currentView === 'TRANSACTIONS' || currentView === 'AI_INSIGHTS') && selectedAccount === 'ALL') {
      loadTransactions();
    }
  }, [currentView, selectedAccount, loadTransactions]);

  // Load only selected account's transactions for drill-down
  useEffect(() => {
    if (selectedAccount !== 'ALL') {
      loadAccountTransactions(selectedAccount);
    } else {
      setAccountTransactions([]);
    }
  }, [selectedAccount, loadAccountTransactions]);

  const handleRenameAccount = async (oldName: string, newName: string) => {
    await DataService.renameAccount(oldName, newName);
    txLoadedRef.current = false;
    await loadDashboardData();
  };

  const handleDeleteAccount = async (accountName: string) => {
    await supabase.from('transactions').delete().eq('account', accountName);
    const { data } = await supabase.from('accounts').select('id, name').eq('name', accountName).limit(1);
    if (data && data.length > 0) {
      const { error } = await supabase.from('accounts').delete().eq('id', data[0].id);
      if (error) {
        toast.error('Failed to delete account');
      } else {
        toast.success(`Account "${accountName}" and its transactions deleted`);
        txLoadedRef.current = false;
        await loadDashboardData();
      }
    }
  };

  const handleImportComplete = async () => {
    txLoadedRef.current = false;
    await loadDashboardData();
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
          <div className="relative" ref={syncMenuRef}>
            <div className="flex items-stretch">
              <button
                onClick={() => handleSyncAll(false)}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-foreground border border-border border-r-0 hover:bg-accent rounded-l-lg transition-colors disabled:opacity-50"
              >
                {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Sync Latest
              </button>
              <button
                onClick={() => setSyncMenuOpen(!syncMenuOpen)}
                disabled={syncing}
                className="flex items-center px-1.5 py-2 text-xs text-foreground border border-border hover:bg-accent rounded-r-lg transition-colors disabled:opacity-50"
              >
                <ChevronDown size={12} />
              </button>
            </div>
            {syncMenuOpen && (
              <div className="absolute right-0 mt-1 w-36 bg-popover border border-border rounded-lg shadow-lg z-50">
                <button
                  onClick={() => handleSyncAll(true)}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  Full Sync
                </button>
              </div>
            )}
          </div>
          <button
            onClick={async () => {
              setRunningAnomalyCheck(true);
              try {
                const result = await DataService.runAnomalyDetection();
                toast.success(`Anomaly check: ${result.checked} accounts checked, ${result.anomalies_found} found, ${result.auto_resolved} auto-resolved`);
                setAnomalyRefreshKey(k => k + 1);
              } catch (e: any) {
                toast.error(e.message || 'Anomaly check failed');
              } finally {
                setRunningAnomalyCheck(false);
              }
            }}
            disabled={runningAnomalyCheck}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-foreground border border-border hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
          >
            {runningAnomalyCheck ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
            Anomaly Check
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

        {currentView === 'DASHBOARD' && (
          <Dashboard
            dashboardData={dashboardData}
            transactions={accountTransactions}
            selectedAccount={selectedAccount}
            onSelectAccount={setSelectedAccount}
            loading={dashboardLoading}
            txLoading={accountTxLoading}
            anomalyRefreshKey={anomalyRefreshKey}
          />
        )}

        {currentView === 'TRANSACTIONS' && (
          <TransactionTable
            transactions={selectedAccount !== 'ALL' ? accountTransactions : transactions}
            selectedAccount={selectedAccount}
            onRefresh={async () => {
              if (selectedAccount !== 'ALL') {
                await loadAccountTransactions(selectedAccount);
              } else {
                txLoadedRef.current = false;
                await loadTransactions();
              }
            }}
          />
        )}

        {currentView === 'AI_INSIGHTS' && (
          <AIInsightsView transactions={selectedAccount !== 'ALL' ? accountTransactions : transactions} />
        )}
      </main>

      {/* Modals */}
      <ImportModal transactions={transactions} accounts={accounts} onImportComplete={handleImportComplete} open={importOpen} onClose={() => setImportOpen(false)} />
      <UpdateBalanceModal transactions={transactions} open={balanceOpen} onClose={() => setBalanceOpen(false)} onComplete={handleImportComplete} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <PayoutReconciler transactions={transactions} open={reconcilerOpen} onClose={() => setReconcilerOpen(false)} />

      {/* Sync progress toasts */}
      {runningSessions.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {runningSessions.map((s) => (
            <SyncProgress
              key={s.connection_id}
              connectionId={s.connection_id}
              provider={s.provider as 'paypal' | 'wise' | 'stripe'}
              accountName={s.account_name}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Index;
