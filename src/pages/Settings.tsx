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
  Database,
  Globe,
  Plus,
  X,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

interface AirwallexConnection {
  id: string;
  account_name: string;
  sync_start_date: string | null;
  last_synced_at: string | null;
  created_at: string;
}

interface AirwallexBalance {
  currency: string;
  available_amount: number;
  pending_amount: number;
  total_amount: number;
  synced_at: string;
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
const AIRWALLEX_COLOR = '#0e6cc4';

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€', USD: '$', GBP: '£', HKD: 'HK$', SGD: 'S$', AUD: 'A$',
  CNY: '¥', JPY: '¥', CHF: 'CHF',
};
const getCurrencySymbol = (c: string) => CURRENCY_SYMBOLS[c] || `${c} `;

interface SettingsProps {
  embedded?: boolean;
}

const Settings: React.FC<SettingsProps> = ({ embedded = false }) => {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<WiseConnection[]>([]);
  const [paypalConnections, setPaypalConnections] = useState<PayPalConnection[]>([]);
  const [stripeConnections, setStripeConnections] = useState<StripeConnection[]>([]);
  const [airwallexConnections, setAirwallexConnections] = useState<AirwallexConnection[]>([]);
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
  const [accounts, setAccounts] = useState<{ id: number; name: string; created_at: string }[]>([]);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState<{ open: boolean; id: number; name: string }>({ open: false, id: 0, name: '' });

  // Airwallex state
  const [airwallexSyncingId, setAirwallexSyncingId] = useState<string | null>(null);
  const [airwallexFormOpen, setAirwallexFormOpen] = useState(false);
  const [airwallexAdding, setAirwallexAdding] = useState(false);
  const [airwallexForm, setAirwallexForm] = useState({
    account_name: '',
    client_id: '',
    api_key: '',
    sync_start_date: '',
  });
  const [airwallexBalances, setAirwallexBalances] = useState<Record<string, AirwallexBalance[]>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [wiseRes, paypalRes, stripeRes, airwallexRes, accountsRes] = await Promise.all([
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
        supabase
          .from('airwallex_connections_safe' as any)
          .select('id, account_name, sync_start_date, last_synced_at, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('accounts')
          .select('id, name, created_at')
          .order('name', { ascending: true }),
      ]);
      setConnections((wiseRes.data as unknown as WiseConnection[]) || []);
      setPaypalConnections((paypalRes.data as unknown as PayPalConnection[]) || []);
      setStripeConnections((stripeRes.data as unknown as StripeConnection[]) || []);
      setAirwallexConnections((airwallexRes.data as unknown as AirwallexConnection[]) || []);
      // Fetch airwallex balances and group by connection_id
      const airwallexIds = ((airwallexRes.data as any[]) || []).map((c: any) => c.id);
      if (airwallexIds.length > 0) {
        const { data: balData } = await supabase
          .from('airwallex_balances' as any)
          .select('connection_id, currency, available_amount, pending_amount, total_amount, synced_at')
          .in('connection_id', airwallexIds);
        const grouped: Record<string, AirwallexBalance[]> = {};
        for (const b of (balData as any[]) || []) {
          if (!grouped[b.connection_id]) grouped[b.connection_id] = [];
          grouped[b.connection_id].push(b);
        }
        setAirwallexBalances(grouped);
      } else {
        setAirwallexBalances({});
      }
      setAccounts((accountsRes.data as any[]) || []);
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

  const handleStripeSync = async (id: string, startDate?: string) => {
    setStripeSyncingId(id);
    try {
      const body: any = { connection_id: id };
      if (startDate) body.start_date = startDate;
      const res = await supabase.functions.invoke('stripe-sync', { body });
      if (res.error) throw res.error;
      const result = res.data;
      toast.success(`Stripe synced: ${result.synced} new transactions${result.backfilled ? ` (${result.backfilled} backfilled)` : ''}`);
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

  // Airwallex handlers
  const handleAirwallexAdd = async () => {
    if (!airwallexForm.account_name || !airwallexForm.client_id || !airwallexForm.api_key) {
      toast.error('Account Name, Client ID and API Key are required');
      return;
    }
    setAirwallexAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('airwallex_connections' as any).insert({
        user_id: user.id,
        account_name: airwallexForm.account_name,
        client_id: airwallexForm.client_id,
        api_key: airwallexForm.api_key,
        sync_start_date: airwallexForm.sync_start_date || null,
      });
      if (error) throw error;
      toast.success('Airwallex connection added');
      setAirwallexFormOpen(false);
      setAirwallexForm({ account_name: '', client_id: '', api_key: '', sync_start_date: '' });
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add connection');
    } finally {
      setAirwallexAdding(false);
    }
  };

  const handleAirwallexSync = async (id: string, fullSync = false) => {
    setAirwallexSyncingId(id);
    try {
      const res = await supabase.functions.invoke('airwallex-sync', {
        body: { connection_id: id, full_sync: fullSync },
      });
      if (res.error) throw res.error;
      toast.success(`Airwallex synced: ${res.data?.synced ?? 0} new transactions`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Airwallex sync failed');
    } finally {
      setAirwallexSyncingId(null);
    }
  };

  const handleAirwallexDelete = async (id: string) => {
    if (!confirm('Delete this Airwallex connection?')) return;
    const { error } = await supabase.from('airwallex_connections' as any).delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else { toast.success('Airwallex connection deleted'); await loadData(); }
  };

  return (
    <div className={embedded ? '' : 'min-h-screen bg-background'}>
      <div className={embedded ? '' : 'max-w-4xl mx-auto px-6 py-8'}>
        {!embedded && (
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
        )}

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
                    {/* Sync with dropdown */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <div className="flex items-center">
                          <button
                            onClick={() => handleStripeSync(conn.id)}
                            disabled={stripeSyncingId === conn.id}
                            className="p-2 text-muted-foreground hover:bg-accent rounded-l-lg transition-colors disabled:opacity-50"
                            title="Sync Now"
                          >
                            {stripeSyncingId === conn.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RefreshCw size={14} />
                            )}
                          </button>
                          <button
                            disabled={stripeSyncingId === conn.id}
                            className="p-2 text-muted-foreground hover:bg-accent rounded-r-lg transition-colors disabled:opacity-50 border-l border-border"
                            title="Sync options"
                          >
                            <ChevronDown size={10} />
                          </button>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-1" align="end">
                        <button
                          onClick={() => handleStripeSync(conn.id)}
                          disabled={stripeSyncingId === conn.id}
                          className="w-full text-left px-3 py-2 text-xs rounded-md hover:bg-accent text-foreground"
                        >
                          Sync (incremental)
                        </button>
                        <button
                          onClick={() => handleStripeSync(conn.id, '2020-01-01')}
                          disabled={stripeSyncingId === conn.id}
                          className="w-full text-left px-3 py-2 text-xs rounded-md hover:bg-accent text-foreground"
                        >
                          Full Historical Sync (from 2020)
                        </button>
                      </PopoverContent>
                    </Popover>
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

        {/* Airwallex Integrations */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Globe size={18} style={{ color: AIRWALLEX_COLOR }} />
              Airwallex Integrations
            </h2>
            <button
              onClick={() => setAirwallexFormOpen(!airwallexFormOpen)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white rounded-lg transition-opacity hover:opacity-90"
              style={{ backgroundColor: AIRWALLEX_COLOR }}
            >
              {airwallexFormOpen ? <X size={14} /> : <Plus size={14} />}
              {airwallexFormOpen ? 'Cancel' : 'Add Connection'}
            </button>
          </div>

          {/* Add form */}
          {airwallexFormOpen && (
            <div className="mb-4 p-4 bg-card border border-border rounded-xl space-y-3">
              <p className="text-xs font-semibold text-foreground">New Airwallex Connection</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Account Name *</label>
                  <input
                    type="text"
                    value={airwallexForm.account_name}
                    onChange={e => setAirwallexForm(f => ({ ...f, account_name: e.target.value }))}
                    placeholder="e.g. Airwallex Main"
                    className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Client ID *</label>
                  <input
                    type="text"
                    value={airwallexForm.client_id}
                    onChange={e => setAirwallexForm(f => ({ ...f, client_id: e.target.value }))}
                    placeholder="Airwallex Client ID"
                    className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground block mb-1">API Key *</label>
                  <input
                    type="password"
                    value={airwallexForm.api_key}
                    onChange={e => setAirwallexForm(f => ({ ...f, api_key: e.target.value }))}
                    placeholder="Airwallex API Key"
                    className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground block mb-1">Sync Start Date (optional)</label>
                  <input
                    type="date"
                    value={airwallexForm.sync_start_date}
                    onChange={e => setAirwallexForm(f => ({ ...f, sync_start_date: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              <button
                onClick={handleAirwallexAdd}
                disabled={airwallexAdding}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: AIRWALLEX_COLOR }}
              >
                {airwallexAdding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                {airwallexAdding ? 'Adding...' : 'Add Connection'}
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-muted-foreground" size={24} />
            </div>
          ) : airwallexConnections.length === 0 && !airwallexFormOpen ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
              <Globe size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No Airwallex connections configured yet.</p>
              <p className="text-xs mt-1">Add your Airwallex credentials to start syncing transactions.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {airwallexConnections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between p-4 bg-card border border-border rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Globe size={14} style={{ color: AIRWALLEX_COLOR }} />
                      <span className="font-semibold text-foreground text-sm">{conn.account_name}</span>
                    </div>
                    {airwallexBalances[conn.id]?.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {airwallexBalances[conn.id].map((b) => {
                          const sym = getCurrencySymbol(b.currency);
                          const formatted = b.available_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                          return (
                            <span key={b.currency} className="text-xs px-2 py-0.5 bg-accent rounded-full text-foreground font-medium">
                              {b.currency} {sym}{formatted}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">Sync to see balances</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Last synced: {conn.last_synced_at
                        ? new Date(conn.last_synced_at).toLocaleString()
                        : 'Never'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3">
                    {/* Sync with Full Sync dropdown */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <div className="flex items-center">
                          <button
                            onClick={() => handleAirwallexSync(conn.id, false)}
                            disabled={airwallexSyncingId === conn.id}
                            className="p-2 text-muted-foreground hover:bg-accent rounded-l-lg transition-colors disabled:opacity-50"
                            title="Sync Now"
                          >
                            {airwallexSyncingId === conn.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RefreshCw size={14} />
                            )}
                          </button>
                          <button
                            disabled={airwallexSyncingId === conn.id}
                            className="p-2 text-muted-foreground hover:bg-accent rounded-r-lg transition-colors disabled:opacity-50 border-l border-border"
                            title="Sync options"
                          >
                            <ChevronDown size={10} />
                          </button>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-44 p-1" align="end">
                        <button
                          onClick={() => handleAirwallexSync(conn.id, false)}
                          disabled={airwallexSyncingId === conn.id}
                          className="w-full text-left px-3 py-2 text-xs rounded-md hover:bg-accent text-foreground"
                        >
                          Sync (incremental)
                        </button>
                        <button
                          onClick={() => handleAirwallexSync(conn.id, true)}
                          disabled={airwallexSyncingId === conn.id}
                          className="w-full text-left px-3 py-2 text-xs rounded-md hover:bg-accent text-foreground"
                        >
                          Full Sync (2 years)
                        </button>
                      </PopoverContent>
                    </Popover>
                    {/* Delete */}
                    <button
                      onClick={() => handleAirwallexDelete(conn.id)}
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

        {/* Accounts Management */}
        <section className="mb-10">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Database size={18} className="text-muted-foreground" />
              Accounts
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">Manage sidebar accounts</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-muted-foreground" size={24} />
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
              <Database size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No accounts found.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between p-3 bg-card border border-border rounded-xl"
                >
                  <div>
                    <span className="font-medium text-foreground text-sm">{acc.name}</span>
                    <p className="text-xs text-muted-foreground">
                      Added: {acc.created_at ? new Date(acc.created_at).toLocaleDateString() : 'Unknown'}
                    </p>
                  </div>
                  <button
                    onClick={() => setDeleteAccountConfirm({ open: true, id: acc.id, name: acc.name })}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    title="Delete account"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Delete Account Confirmation */}
        <AlertDialog open={deleteAccountConfirm.open} onOpenChange={(open) => !open && setDeleteAccountConfirm({ open: false, id: 0, name: '' })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Account</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{deleteAccountConfirm.name}</strong>? This will permanently delete the account AND all its associated transactions. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  // First delete all transactions for this account
                  await supabase.from('transactions').delete().eq('account', deleteAccountConfirm.name);
                  // Then delete the account row
                  const { error } = await supabase.from('accounts').delete().eq('id', deleteAccountConfirm.id);
                  if (error) toast.error('Failed to delete account');
                  else { toast.success(`Account "${deleteAccountConfirm.name}" and its transactions deleted`); await loadData(); }
                  setDeleteAccountConfirm({ open: false, id: 0, name: '' });
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <WiseConnectionWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          onComplete={async () => {
            await loadData();
            // Trigger historical sync for the newest Wise connection
            const { data } = await supabase
              .from('wise_connections_safe' as any)
              .select('id')
              .order('created_at', { ascending: false })
              .limit(1) as { data: any[] | null };
            if (data?.[0]?.id) {
              supabase.functions.invoke('start-historical-sync', {
                body: { connection_id: data[0].id, provider: 'wise' },
              }).then(res => {
                if (res.error) console.error('Historical sync trigger failed:', res.error);
                else toast.success('Historical sync queued — progress will appear on the dashboard.');
              });
            }
          }}
        />
        <PayPalConnectionWizard
          isOpen={paypalWizardOpen}
          onClose={() => setPaypalWizardOpen(false)}
          onSuccess={async () => {
            await loadData();
            const { data } = await supabase
              .from('paypal_connections_safe' as any)
              .select('id')
              .order('created_at', { ascending: false })
              .limit(1) as { data: any[] | null };
            if (data?.[0]?.id) {
              supabase.functions.invoke('start-historical-sync', {
                body: { connection_id: data[0].id, provider: 'paypal' },
              }).then(res => {
                if (res.error) console.error('Historical sync trigger failed:', res.error);
                else toast.success('Historical sync queued — progress will appear on the dashboard.');
              });
            }
          }}
        />
        <StripeConnectionWizard
          isOpen={stripeWizardOpen}
          onClose={() => setStripeWizardOpen(false)}
          onSuccess={async () => {
            await loadData();
            const { data } = await supabase
              .from('stripe_connections_safe' as any)
              .select('id')
              .order('created_at', { ascending: false })
              .limit(1) as { data: any[] | null };
            if (data?.[0]?.id) {
              supabase.functions.invoke('start-historical-sync', {
                body: { connection_id: data[0].id, provider: 'stripe' },
              }).then(res => {
                if (res.error) console.error('Historical sync trigger failed:', res.error);
                else toast.success('Historical sync queued — progress will appear on the dashboard.');
              });
            }
          }}
        />
      </div>
    </div>
  );
};

export default Settings;
