import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DataService } from '@/services/dataService';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle,
  Loader2,
  Wifi,
  X,
} from 'lucide-react';

interface WiseConnection {
  id: string;
  account_name: string;
  profile_id: string;
  balance_id: string;
  currency: string;
  last_synced_at: string | null;
  created_at: string;
}

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<WiseConnection[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    account_name: '',
    api_token: '',
    profile_id: '',
    balance_id: '',
    currency: 'EUR',
  });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accs, { data: conns }] = await Promise.all([
        DataService.fetchAccounts(),
        supabase
          .from('wise_connections')
          .select('id, account_name, profile_id, balance_id, currency, last_synced_at, created_at')
          .order('created_at', { ascending: false }),
      ]);
      setAccounts(accs);
      setConnections((conns as WiseConnection[]) || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.account_name || !form.api_token || !form.profile_id || !form.balance_id) {
      toast.error('All fields are required');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Not authenticated'); return; }

      const { error } = await supabase.from('wise_connections').insert({
        user_id: user.id,
        account_name: form.account_name,
        api_token: form.api_token,
        profile_id: form.profile_id,
        balance_id: form.balance_id,
        currency: form.currency,
      });
      if (error) throw error;
      toast.success('Wise connection added');
      setShowForm(false);
      setForm({ account_name: '', api_token: '', profile_id: '', balance_id: '', currency: 'EUR' });
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add connection');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this Wise connection?')) return;
    const { error } = await supabase.from('wise_connections').delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else { toast.success('Connection deleted'); await loadData(); }
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('wise-sync', {
        body: { wise_connection_id: id, days_back: 90 },
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
      const conn = connections.find(c => c.id === id);
      if (!conn) return;

      // We need the api_token — fetch it from the edge function or directly
      // For test, call Wise profiles endpoint via a lightweight edge call
      const { data: fullConn } = await supabase
        .from('wise_connections')
        .select('api_token')
        .eq('id', id)
        .single();

      if (!fullConn?.api_token) {
        toast.error('Could not retrieve API token');
        return;
      }

      // We can't call Wise directly from the browser (CORS), so we'll just try a sync with 1 day
      const res = await supabase.functions.invoke('wise-sync', {
        body: { wise_connection_id: id, days_back: 1 },
      });
      if (res.error) throw res.error;
      toast.success('Connection is working! ✓');
    } catch (err: any) {
      toast.error(`Connection test failed: ${err.message || 'Unknown error'}`);
    } finally {
      setTestingId(null);
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
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-lg transition-opacity"
            >
              <Plus size={14} />
              Add Connection
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
              <p className="text-xs mt-1">Add one to start syncing transactions.</p>
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
                    <button
                      onClick={() => handleSync(conn.id)}
                      disabled={syncingId === conn.id}
                      className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Sync Now"
                    >
                      {syncingId === conn.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                    </button>
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

        {/* Add Connection Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-card rounded-xl w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between p-5 border-b border-border">
                <h3 className="font-bold text-foreground">Add Wise Connection</h3>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleAdd} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Account</label>
                  <select
                    required
                    value={form.account_name}
                    onChange={(e) => setForm(f => ({ ...f, account_name: e.target.value }))}
                    className="w-full p-2 border border-input rounded-lg bg-background text-sm"
                  >
                    <option value="">Select account...</option>
                    {accounts.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">API Token</label>
                  <input
                    type="password"
                    required
                    value={form.api_token}
                    onChange={(e) => setForm(f => ({ ...f, api_token: e.target.value }))}
                    className="w-full p-2 border border-input rounded-lg bg-background text-sm"
                    placeholder="Wise Personal API Token"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Profile ID</label>
                    <input
                      type="text"
                      required
                      value={form.profile_id}
                      onChange={(e) => setForm(f => ({ ...f, profile_id: e.target.value }))}
                      className="w-full p-2 border border-input rounded-lg bg-background text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Balance ID</label>
                    <input
                      type="text"
                      required
                      value={form.balance_id}
                      onChange={(e) => setForm(f => ({ ...f, balance_id: e.target.value }))}
                      className="w-full p-2 border border-input rounded-lg bg-background text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Currency</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm(f => ({ ...f, currency: e.target.value }))}
                    className="w-full p-2 border border-input rounded-lg bg-background text-sm"
                  >
                    {['EUR', 'USD', 'GBP', 'MAD', 'ILS', 'DKK', 'SEK'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    Add Connection
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
