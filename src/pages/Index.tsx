import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ViewState, Transaction, DashboardData } from '@/types';
import { DataService } from '@/services/dataService';
import { supabase } from '@/integrations/supabase/client';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import NewDashboard from '@/components/dashboard/NewDashboard';
import TransactionFeed from '@/components/transactions/TransactionFeed';
import AIView from '@/components/ai/AIView';
import PnlReport from '@/components/pnl/PnlReport';
import EquityDashboard from '@/components/equity/EquityDashboard';
import ImportModal from '@/components/ai/ImportModal';
import UpdateBalanceModal from '@/components/modals/UpdateBalanceModal';
import PayoutReconciler from '@/components/modals/PayoutReconciler';
import SyncProgress from '@/components/SyncProgress';
import Settings from '@/pages/Settings';
import { toast } from 'sonner';

const VIEW_TITLES: Record<ViewState, string> = {
  DASHBOARD: 'Overview',
  PNL: 'Profit & Loss',
  EQUITY: 'Balance Sheet',
  TRANSACTIONS: 'Transactions',
  AI_INSIGHTS: 'AI Analyst',
  SETTINGS: 'Settings',
};

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

  const [importOpen, setImportOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [reconcilerOpen, setReconcilerOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [anomalyRefreshKey, setAnomalyRefreshKey] = useState(0);
  const [runningAnomalyCheck, setRunningAnomalyCheck] = useState(false);
  const [runningSessions, setRunningSessions] = useState<
    { connection_id: string; provider: string; account_name: string }[]
  >([]);

  const handleSyncAll = async (fullSync: boolean = false) => {
    setSyncing(true);
    try {
      let totalInserted = 0;
      const { data: wiseConns } = await supabase.from('wise_connections').select('id, account_name');
      if (wiseConns && wiseConns.length > 0) {
        for (const conn of wiseConns) {
          const res = await supabase.functions.invoke('wise-sync', { body: { wise_connection_id: conn.id, full_sync: fullSync } });
          if (!res.error && res.data) totalInserted += res.data.inserted || 0;
        }
      }
      const { data: paypalConns } = await supabase.from('paypal_connections' as any).select('id, account_name');
      if (paypalConns && paypalConns.length > 0) {
        for (const conn of paypalConns as any[]) {
          const res = await supabase.functions.invoke('paypal-sync', { body: { connection_id: conn.id, full_sync: fullSync } });
          if (!res.error && res.data) totalInserted += res.data.synced || 0;
        }
      }
      const { data: stripeConns } = await supabase.from('stripe_connections' as any).select('id, account_name');
      if (stripeConns && stripeConns.length > 0) {
        for (const conn of stripeConns as any[]) {
          const res = await supabase.functions.invoke('stripe-sync', { body: { connection_id: conn.id, full_sync: fullSync } });
          if (!res.error && res.data) totalInserted += res.data.synced || 0;
        }
      }
      const { data: airwallexConns } = await supabase.from('airwallex_connections_safe' as any).select('id, account_name');
      if (airwallexConns?.length) {
        for (const conn of airwallexConns as any[]) {
          const res = await supabase.functions.invoke('airwallex-sync', { body: { connection_id: conn.id, full_sync: fullSync } });
          if (!res.error && res.data) totalInserted += res.data.synced || 0;
        }
      }
      if (!wiseConns?.length && !paypalConns?.length && !stripeConns?.length && !airwallexConns?.length) {
        toast.info('No connections configured. Go to Settings to add one.');
      } else {
        toast.success(`Sync complete: ${totalInserted} new transactions`);
      }
      txLoadedRef.current = false;
      await loadDashboardData();
    } catch (err: any) { toast.error(err.message || 'Sync failed'); } finally { setSyncing(false); }
  };

  const loadDashboardData = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const [dd, accsResult, wiseRes, paypalRes, stripeRes, airwallexRes] = await Promise.all([
        DataService.fetchDashboardData(),
        supabase.from('accounts').select('name'),
        supabase.from('wise_connections_safe' as any).select('account_name'),
        supabase.from('paypal_connections_safe' as any).select('account_name'),
        supabase.from('stripe_connections_safe' as any).select('account_name'),
        supabase.from('airwallex_connections_safe' as any).select('account_name'),
      ]);

      const fromTable = (accsResult.data || []).map((r: any) => r.name as string).filter(Boolean);
      const fromConnections = [
        ...(wiseRes.data || []).map((r: any) => r.account_name as string),
        ...(paypalRes.data || []).map((r: any) => r.account_name as string),
        ...(stripeRes.data || []).map((r: any) => r.account_name as string),
        ...(airwallexRes.data || []).map((r: any) => r.account_name as string),
      ].filter(Boolean);

      const accs = [...new Set([...fromTable, ...fromConnections])].sort();
      setDashboardData(dd);
      setAccounts(accs);
    } catch (e) { console.error('Failed to load dashboard data:', e); } finally { setDashboardLoading(false); }
  }, []);

  const loadTransactions = useCallback(async () => {
    if (txLoadedRef.current) return;
    setTxLoading(true);
    try { const txs = await DataService.fetchTransactions(); setTransactions(txs); txLoadedRef.current = true; }
    catch (e) { console.error('Failed to load transactions:', e); } finally { setTxLoading(false); }
  }, []);

  const loadAccountTransactions = useCallback(async (account: string) => {
    setAccountTxLoading(true);
    setAccountTransactions([]);
    try { const txs = await DataService.fetchAccountTransactions(account); setAccountTransactions(txs); }
    catch (e) { console.error('Failed to load account transactions:', e); } finally { setAccountTxLoading(false); }
  }, []);

  useEffect(() => {
    loadDashboardData();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: sessions } = await supabase.from('sync_sessions').select('connection_id, provider').eq('user_id', user.id).eq('status', 'running');
      if (sessions?.length) {
        const enriched = await Promise.all(sessions.map(async (s: any) => {
          const table = s.provider === 'paypal' ? 'paypal_connections_safe' : s.provider === 'wise' ? 'wise_connections_safe' : 'stripe_connections_safe';
          const { data } = await supabase.from(table).select('account_name').eq('id', s.connection_id).limit(1);
          return { connection_id: s.connection_id, provider: s.provider, account_name: data?.[0]?.account_name || s.provider };
        }));
        setRunningSessions(enriched);
      }
    })();
  }, [loadDashboardData]);

  useEffect(() => {
    if ((currentView === 'TRANSACTIONS' || currentView === 'AI_INSIGHTS') && selectedAccount === 'ALL') loadTransactions();
  }, [currentView, selectedAccount, loadTransactions]);

  useEffect(() => {
    if (selectedAccount !== 'ALL') loadAccountTransactions(selectedAccount);
    else setAccountTransactions([]);
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
      if (error) toast.error('Failed to delete account');
      else { toast.success(`Account "${accountName}" deleted`); txLoadedRef.current = false; await loadDashboardData(); }
    }
  };

  const handleImportComplete = async () => { txLoadedRef.current = false; await loadDashboardData(); };

  const handleAnomalyCheck = async () => {
    setRunningAnomalyCheck(true);
    try {
      const result = await DataService.runAnomalyDetection();
      toast.success(`Anomaly check: ${result.checked} accounts, ${result.anomalies_found} found, ${result.auto_resolved} auto-resolved`);
      setAnomalyRefreshKey(k => k + 1);
    } catch (e: any) { toast.error(e.message || 'Anomaly check failed'); } finally { setRunningAnomalyCheck(false); }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        accounts={accounts}
        selectedAccount={selectedAccount}
        onSelectAccount={setSelectedAccount}
        onRenameAccount={handleRenameAccount}
        onDeleteAccount={handleDeleteAccount}
        onLogout={async () => { await supabase.auth.signOut(); navigate('/login'); }}
      />

      <div className="flex-1 ml-64 flex flex-col overflow-hidden">
        {currentView !== 'SETTINGS' && (
          <TopBar
            title={VIEW_TITLES[currentView]}
            onSync={handleSyncAll}
            syncing={syncing}
            onImport={() => setImportOpen(true)}
            onUpdateBalance={() => setBalanceOpen(true)}
            onReconcile={() => setReconcilerOpen(true)}
            onAnomalyCheck={handleAnomalyCheck}
            runningAnomalyCheck={runningAnomalyCheck}
          />
        )}

        <main className="flex-1 overflow-y-auto p-7">
          {currentView === 'DASHBOARD' && (
            <NewDashboard
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
            <TransactionFeed transactions={selectedAccount !== 'ALL' ? accountTransactions : transactions} loading={txLoading} />
          )}
          {currentView === 'AI_INSIGHTS' && (
            <AIView transactions={selectedAccount !== 'ALL' ? accountTransactions : transactions} />
          )}
          {currentView === 'PNL' && <PnlReport />}
          {currentView === 'EQUITY' && dashboardData && (
            <EquityDashboard accountBalances={dashboardData.accountBalances} />
          )}
          {currentView === 'SETTINGS' && <Settings embedded />}
        </main>
      </div>

      <ImportModal transactions={transactions} accounts={accounts} onImportComplete={handleImportComplete} open={importOpen} onClose={() => setImportOpen(false)} />
      <UpdateBalanceModal transactions={transactions} open={balanceOpen} onClose={() => setBalanceOpen(false)} onComplete={handleImportComplete} />
      <PayoutReconciler transactions={transactions} open={reconcilerOpen} onClose={() => setReconcilerOpen(false)} />

      {runningSessions.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {runningSessions.map((s) => (
            <SyncProgress key={s.connection_id} connectionId={s.connection_id} provider={s.provider as 'paypal' | 'wise' | 'stripe'} accountName={s.account_name} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Index;
