import React, { useState, useEffect, useCallback } from 'react';
import { ViewState, Transaction } from '@/types';
import { DataService } from '@/services/dataService';
import { useAuth } from '@/hooks/useAuth';
import AuthPage from '@/components/AuthPage';
import AppSidebar from '@/components/AppSidebar';
import Dashboard from '@/components/dashboard/Dashboard';
import { Loader2 } from 'lucide-react';

const Index: React.FC = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');
  const [selectedAccount, setSelectedAccount] = useState<string | 'ALL'>('ALL');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [txLoading, setTxLoading] = useState(true);

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
    if (user) loadData();
  }, [user, loadData]);

  const handleRenameAccount = async (oldName: string, newName: string) => {
    await DataService.renameAccount(oldName, newName);
    await loadData();
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        selectedAccount={selectedAccount}
        onSelectAccount={setSelectedAccount}
        accounts={accounts}
        onRenameAccount={handleRenameAccount}
        onLogout={signOut}
        onOpenSettings={() => {}}
      />

      <main className="flex-1 ml-72 p-6 overflow-auto">
        {/* Dashboard */}
        <div style={{ display: currentView === 'DASHBOARD' ? 'block' : 'none' }}>
          <Dashboard
            transactions={transactions}
            selectedAccount={selectedAccount}
            onSelectAccount={setSelectedAccount}
            loading={txLoading}
          />
        </div>

        {/* Transactions placeholder */}
        <div style={{ display: currentView === 'TRANSACTIONS' ? 'block' : 'none' }}>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            Transaction management coming in Phase 4
          </div>
        </div>

        {/* AI Insights placeholder */}
        <div style={{ display: currentView === 'AI_INSIGHTS' ? 'block' : 'none' }}>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            AI Analyst coming in Phase 5
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
