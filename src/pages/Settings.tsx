import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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
  CreditCard,
  Zap,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import WiseConnectionWizard from '@/components/WiseConnectionWizard';
import PayPalConnectionWizard from '@/components/PayPalConnectionWizard';
import StripeConnectionWizard from '@/components/StripeConnectionWizard';

interface WiseConnection {
  id: string;
  account_name: string;
  profile_id: string;
  balance_id: string;
  currency: string;
  last_synced_at: string | null;
  created_at: string;
}

interface PayPalConnection {
  id: string;
  account_name: string;
  email: string | null;
  currency: string | null;
  environment: string | null;
  last_synced_at: string | null;
  created_at: string;
}

interface StripeConnection {
  id: string;
  account_name: string;
  stripe_account_id: string | null;
  email: string | null;
  currency: string | null;
  environment: string | null;
  last_synced_at: string | null;
  created_at: string;
}

interface WiseBalance {
  id: number;
  currency: string;
  amount: number;
}

interface PayPalBalance {
  currency: string;
  available: number;
  withheld: number;
  total: number;
}

interface StripeBalance {
  currency: string;
  available: number;
  pending: number;
  total: number;
}

const STRIPE_COLOR = '#635bff';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<WiseConnection[]>([]);
  const [paypalConnections, setPaypalConnections] = useState<PayPalConnection[]>([]);
  const [stripeConnections, setStripeConnections] = useState<StripeConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [paypalWizardOpen, setPaypalWizardOpen] = useState(false);
  const [stripeWizardOpen, setStripeWizardOpen] = useState(false);
  const [balancesLoading, setBalancesLoading] = useState<string | null>(null);
  const [balancesData, setBalancesData] = useState<{ connId: string; balances: WiseBalance[] } | null>(null);
  const [paypalBalancesLoading, setPaypalBalancesLoading] = useState<string | null>(null);
  const [paypalBalancesData, setPaypalBalancesData] = useState<{ connId: string; balances: PayPalBalance[] } | null>(null);
  const [paypalSyncingId, setPaypalSyncingId] = useState<string | null>(null);
  const [stripeSyncingId, setStripeSyncingId] = useState<string | null>(null);
  const [stripeBalancesLoading, setStripeBalancesLoading] = useState<string | null>(null);
  const [stripeBalancesData, setStripeBalancesData] = useState<{ connId: string; balances: StripeBalance[] } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [wiseRes, paypalRes, stripeRes] = await Promise.all([
        supabase
          .from('wise_connections_safe' as any)
          .select('id, account_name, profile_id, balance_id, currency, last_synced_at, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('paypal_connections_safe' as any)
          .select('id, account_name, email, currency, environment, last_synced_at, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('stripe_connections_safe' as any)
          .select('id, account_name, stripe_account_id, email, currency, environment, last_synced_at, created_at')
          .order('created_at', { ascending: false }),
      ]);
      setConnections((wiseRes.data as unknown as WiseConnection[]) || []);
      setPaypalConnections((paypalRes.data as unknown as PayPalConnection[]) || []);
      setStripeConnections((stripeRes.data as unknown as StripeConnection[]) || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Wise handlers
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

  // PayPal handlers
  const handlePayPalDelete = async (id: string) => {
    if (!confirm('Delete this PayPal connection?')) return;
    const { error } = await supabase.from('paypal_connections' as any).delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else { toast.success('PayPal connection deleted'); await loadData(); }
  };

  const handlePayPalSync = async (id: string) => {
    setPaypalSyncingId(id);
    try {
      const res = await supabase.functions.invoke('paypal-sync', {
        body: { connection_id: id },
      });
      if (res.error) throw res.error;
      const result = res.data;
      toast.success(`PayPal synced: ${result.synced} new transactions`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'PayPal sync failed');
    } finally {
      setPaypalSyncingId(null);
    }
  };

  const handlePayPalViewBalances = async (id: string) => {
    setPaypalBalancesLoading(id);
    try {
      const res = await supabase.functions.invoke('paypal-balances', {
        body: { connection_id: id },
      });
      if (res.error) throw res.error;
      setPaypalBalancesData({ connId: id, balances: res.data.balances || [] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch PayPal balances');
    } finally {
      setPaypalBalancesLoading(null);
    }
  };

  // Stripe handlers
  const handleStripeDelete = async (id: string) => {
    if (!confirm('Delete this Stripe connection?')) return;
    const { error } = await supabase.from('stripe_connections' as any).delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else { toast.success('Stripe connection deleted'); await loadData(); }
  };

  const handleStripeSync = async (id: string) => {
    setStripeSyncingId(id);
    try {
      const res = await supabase.functions.invoke('stripe-sync', {
        body: { connection_id: id },
      });
      if (res.error) throw res.error;
      const result = res.data;
      toast.success(`Stripe synced: ${result.synced} new transactions`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Stripe sync failed');
    } finally {
      setStripeSyncingId(null);
    }
  };

  const handleStripeViewBalances = async (id: string) => {
    setStripeBalancesLoading(id);
    try {
      const res = await supabase.functions.invoke('stripe-balances', {
        body: { connection_id: id },
      });
      if (res.error) throw res.error;
      setStripeBalancesData({ connId: id, balances: res.data.balances || [] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch Stripe balances');
    } finally {
      setStripeBalancesLoading(null);
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
        <section className="mb-10">
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

        {/* PayPal Integrations */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <CreditCard size={18} className="text-[#0070ba]" />
              PayPal Integrations
            </h2>
            <button
              onClick={() => setPaypalWizardOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white rounded-lg transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#0070ba' }}
            >
              <CreditCard size={14} />
              Connect PayPal Account
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-muted-foreground" size={24} />
            </div>
          ) : paypalConnections.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
              <CreditCard size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No PayPal connections configured yet.</p>
              <p className="text-xs mt-1">Connect your PayPal account to start syncing transactions.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {paypalConnections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between p-4 bg-card border border-border rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <CreditCard size={14} className="text-[#0070ba]" />
                      <span className="font-semibold text-foreground text-sm">{conn.account_name}</span>
                      {conn.currency && (
                        <span className="text-xs px-2 py-0.5 bg-accent rounded-full text-muted-foreground font-medium">
                          {conn.currency}
                        </span>
                      )}
                    </div>
                    {conn.email && (
                      <p className="text-xs text-muted-foreground mt-1">{conn.email}</p>
                    )}
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
                          onClick={() => handlePayPalViewBalances(conn.id)}
                          disabled={paypalBalancesLoading === conn.id}
                          className="p-2 text-muted-foreground hover:text-[#0070ba] hover:bg-[#0070ba]/10 rounded-lg transition-colors disabled:opacity-50"
                          title="View Balances"
                        >
                          {paypalBalancesLoading === conn.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Eye size={14} />
                          )}
                        </button>
                      </PopoverTrigger>
                      {paypalBalancesData?.connId === conn.id && (
                        <PopoverContent className="w-72 p-0" align="end">
                          <div className="p-3 border-b border-border">
                            <p className="text-xs font-bold text-foreground">PayPal Balances</p>
                          </div>
                          {paypalBalancesData.balances.length === 0 ? (
                            <p className="p-3 text-xs text-muted-foreground">No balances found.</p>
                          ) : (
                            <div className="p-2 space-y-1">
                              {paypalBalancesData.balances.map((b) => (
                                <div key={b.currency} className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent">
                                  <span className="text-xs font-medium text-foreground">{b.currency}</span>
                                  <div className="text-right">
                                    <span className="text-xs font-semibold text-foreground">
                                      {b.available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    {b.withheld > 0 && (
                                      <span className="text-[10px] text-muted-foreground ml-1">
                                        +{b.withheld.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} held
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </PopoverContent>
                      )}
                    </Popover>
                    {/* Sync */}
                    <button
                      onClick={() => handlePayPalSync(conn.id)}
                      disabled={paypalSyncingId === conn.id}
                      className="p-2 text-muted-foreground hover:text-[#0070ba] hover:bg-[#0070ba]/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Sync Now"
                    >
                      {paypalSyncingId === conn.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => handlePayPalDelete(conn.id)}
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

        {/* Stripe Integrations */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Zap size={18} style={{ color: STRIPE_COLOR }} />
              Stripe Integrations
            </h2>
            <button
              onClick={() => setStripeWizardOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white rounded-lg transition-opacity hover:opacity-90"
              style={{ backgroundColor: STRIPE_COLOR }}
            >
              <Zap size={14} />
              Connect Stripe Account
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-muted-foreground" size={24} />
            </div>
          ) : stripeConnections.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
              <Zap size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No Stripe connections configured yet.</p>
              <p className="text-xs mt-1">Connect your Stripe account to start syncing transactions.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stripeConnections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between p-4 bg-card border border-border rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Zap size={14} style={{ color: STRIPE_COLOR }} />
                      <span className="font-semibold text-foreground text-sm">{conn.account_name}</span>
                      {conn.currency && (
                        <span className="text-xs px-2 py-0.5 bg-accent rounded-full text-muted-foreground font-medium">
                          {conn.currency}
                        </span>
                      )}
                    </div>
                    {conn.email && (
                      <p className="text-xs text-muted-foreground mt-1">{conn.email}</p>
                    )}
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
                          onClick={() => handleStripeViewBalances(conn.id)}
                          disabled={stripeBalancesLoading === conn.id}
                          className="p-2 text-muted-foreground rounded-lg transition-colors disabled:opacity-50"
                          style={{ color: stripeBalancesLoading === conn.id ? undefined : undefined }}
                          title="View Balances"
                        >
                          {stripeBalancesLoading === conn.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Eye size={14} />
                          )}
                        </button>
                      </PopoverTrigger>
                      {stripeBalancesData?.connId === conn.id && (
                        <PopoverContent className="w-72 p-0" align="end">
                          <div className="p-3 border-b border-border">
                            <p className="text-xs font-bold text-foreground">Stripe Balances</p>
                          </div>
                          {stripeBalancesData.balances.length === 0 ? (
                            <p className="p-3 text-xs text-muted-foreground">No balances found.</p>
                          ) : (
                            <div className="p-2 space-y-1">
                              {stripeBalancesData.balances.map((b) => (
                                <div key={b.currency} className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent">
                                  <span className="text-xs font-medium text-foreground">{b.currency}</span>
                                  <div className="text-right">
                                    <span className="text-xs font-semibold text-foreground">
                                      {b.available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    {b.pending !== 0 && (
                                      <span className="text-[10px] text-muted-foreground ml-1">
                                        +{b.pending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pending
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </PopoverContent>
                      )}
                    </Popover>
                    {/* Sync */}
                    <button
                      onClick={() => handleStripeSync(conn.id)}
                      disabled={stripeSyncingId === conn.id}
                      className="p-2 text-muted-foreground rounded-lg transition-colors disabled:opacity-50"
                      title="Sync Now"
                    >
                      {stripeSyncingId === conn.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => handleStripeDelete(conn.id)}
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
        <PayPalConnectionWizard
          isOpen={paypalWizardOpen}
          onClose={() => setPaypalWizardOpen(false)}
          onSuccess={loadData}
        />
        <StripeConnectionWizard
          isOpen={stripeWizardOpen}
          onClose={() => setStripeWizardOpen(false)}
          onSuccess={loadData}
        />
      </div>
    </div>
  );
};

export default Settings;
