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
import { Upload, Scale, ArrowLeftRight } from 'lucide-react';

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

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        selectedAccount={selectedAccount}
        onSelectAccount={setSelectedAccount}
        accounts={accounts}
        onRenameAccount={handleRenameAccount}
        onLogout={async () => { await supabase.auth.signOut(); navigate('/login'); }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex-1 ml-72 p-6 overflow-auto">
        {/* Action bar */}
        <div className="flex justify-end gap-2 mb-4">
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
