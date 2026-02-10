import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DataService } from '@/services/dataService';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Trash2,
  RefreshCw,
  CheckCircle,
  Loader2,
  Wifi,
  Eye,
  ChevronDown,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import WiseConnectionWizard from '@/components/WiseConnectionWizard';

interface WiseConnection {
  id: string;
  account_name: string;
  profile_id: string;
  balance_id: string;
  currency: string;
  last_synced_at: string | null;
  created_at: string;
}

interface WiseBalance {
  id: number;
  currency: string;
  amount: number;
}

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<WiseConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [balancesLoading, setBalancesLoading] = useState<string | null>(null);
  const [balancesData, setBalancesData] = useState<{ connId: string; balances: WiseBalance[] } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: conns } = await supabase
        .from('wise_connections_safe' as any)
        .select('id, account_name, profile_id, balance_id, currency, last_synced_at, created_at')
        .order('created_at', { ascending: false });
      setConnections((conns as unknown as WiseConnection[]) || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this Wise connection?')) return;
    const { error } = await supabase.from('wise_connections').delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else { toast.success('Connection deleted'); await loadData(); }
  };

  const handleSync = async (id: string, fullSync = false) => {
    setSyncingId(id);
    try {
      const res = await supabase.functions.invoke('wise-sync', {
        body: { wise_connection_id: id, full_sync: fullSync },
      });
      if (res.error) throw res.error;
      const result = res.data;
      toast.success(`Synced: ${result.inserted} new transactions (${result.total} total from Wise)`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setSyncingId(null);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await supabase.functions.invoke('wise-sync', {
        body: { wise_connection_id: id, full_sync: false },
      });
      if (res.error) throw res.error;
      toast.success('Connection is working! ✓');
    } catch (err: any) {
      toast.error(`Connection test failed: ${err.message || 'Unknown error'}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleViewBalances = async (id: string) => {
    setBalancesLoading(id);
    try {
      const res = await supabase.functions.invoke('wise-balances', {
        body: { wise_connection_id: id },
      });
      if (res.error) throw res.error;
      setBalancesData({ connId: id, balances: res.data.balances || [] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch balances');
    } finally {
      setBalancesLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">Manage integrations and connections</p>
          </div>
        </div>

        {/* Wise Integrations */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Wifi size={18} className="text-emerald-500" />
              Wise Integrations
            </h2>
            <button
              onClick={() => setWizardOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-opacity"
            >
              <Wifi size={14} />
              Connect Wise Account
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-muted-foreground" size={24} />
            </div>
          ) : connections.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
              <Wifi size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No Wise connections configured yet.</p>
              <p className="text-xs mt-1">Connect your Wise account to start syncing transactions.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between p-4 bg-card border border-border rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-sm">{conn.account_name}</span>
                      <span className="text-xs px-2 py-0.5 bg-accent rounded-full text-muted-foreground font-medium">
                        {conn.currency}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Profile: {conn.profile_id} · Balance: {conn.balance_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last synced: {conn.last_synced_at
                        ? new Date(conn.last_synced_at).toLocaleString()
                        : 'Never'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3">
                    {/* View Balances */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          onClick={() => handleViewBalances(conn.id)}
                          disabled={balancesLoading === conn.id}
                          className="p-2 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                          title="View Balances"
                        >
                          {balancesLoading === conn.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Eye size={14} />
                          )}
                        </button>
                      </PopoverTrigger>
                      {balancesData?.connId === conn.id && (
                        <PopoverContent className="w-64 p-0" align="end">
                          <div className="p-3 border-b border-border">
                            <p className="text-xs font-bold text-foreground">Wise Balances</p>
                          </div>
                          {balancesData.balances.length === 0 ? (
                            <p className="p-3 text-xs text-muted-foreground">No balances found.</p>
                          ) : (
                            <div className="p-2 space-y-1">
                              {balancesData.balances.map((b) => (
                                <div key={b.id} className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent">
                                  <span className="text-xs font-medium text-foreground">{b.currency}</span>
                                  <span className="text-xs font-semibold text-foreground">
                                    {b.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </PopoverContent>
                      )}
                    </Popover>
                    {/* Test */}
                    <button
                      onClick={() => handleTest(conn.id)}
                      disabled={testingId === conn.id}
                      className="p-2 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Test Connection"
                    >
                      {testingId === conn.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle size={14} />
                      )}
                    </button>
                    {/* Sync with dropdown */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <div className="flex items-center">
                          <button
                            onClick={() => handleSync(conn.id, false)}
                            disabled={syncingId === conn.id}
                            className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-l-lg transition-colors disabled:opacity-50"
                            title="Sync Now"
                          >
                            {syncingId === conn.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RefreshCw size={14} />
                            )}
                          </button>
                          <button
                            disabled={syncingId === conn.id}
                            className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-r-lg transition-colors disabled:opacity-50 border-l border-border"
                            title="Sync options"
                          >
                            <ChevronDown size={10} />
                          </button>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-44 p-1" align="end">
                        <button
                          onClick={() => handleSync(conn.id, false)}
                          disabled={syncingId === conn.id}
                          className="w-full text-left px-3 py-2 text-xs rounded-md hover:bg-accent text-foreground"
                        >
                          Sync (incremental)
                        </button>
                        <button
                          onClick={() => handleSync(conn.id, true)}
                          disabled={syncingId === conn.id}
                          className="w-full text-left px-3 py-2 text-xs rounded-md hover:bg-accent text-foreground"
                        >
                          Full Sync (from 2020)
                        </button>
                      </PopoverContent>
                    </Popover>
                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(conn.id)}
                      className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <WiseConnectionWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          onComplete={loadData}
        />
      </div>
    </div>
  );
};

export default Settings;
