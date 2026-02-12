import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Search,
  Eye,
  EyeOff,
  Zap,
} from 'lucide-react';

interface DiscoveredBalance {
  currency: string;
  available: number;
  pending: number;
  total: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const STRIPE_COLOR = '#635bff';

const StripeConnectionWizard: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [email, setEmail] = useState('');
  const [balances, setBalances] = useState<DiscoveredBalance[]>([]);
  const [accountName, setAccountName] = useState('');
  const [connecting, setConnecting] = useState(false);

  const reset = () => {
    setStep(1);
    setApiKey('');
    setShowKey(false);
    setDiscovering(false);
    setAccountId('');
    setEmail('');
    setBalances([]);
    setAccountName('');
    setConnecting(false);
  };

  const handleDiscover = async () => {
    if (!apiKey.trim()) return;
    setDiscovering(true);
    try {
      const res = await supabase.functions.invoke('stripe-discover', {
        body: { api_key: apiKey.trim() },
      });
      if (res.error) throw new Error(res.error.message || 'Discovery failed');
      if (res.data?.error) throw new Error(res.data.error);
      setAccountId(res.data.account_id || '');
      setEmail(res.data.email || '');
      setBalances(res.data.balances || []);
      setAccountName(res.data.email || 'Stripe');
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || 'Failed to discover Stripe account');
    } finally {
      setDiscovering(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const primaryCurrency = balances[0]?.currency || 'USD';

      const { data: inserted, error } = await supabase
        .from('stripe_connections' as any)
        .insert({
          user_id: user.id,
          account_name: accountName.trim() || 'Stripe',
          api_key: apiKey.trim(),
          stripe_account_id: accountId,
          email,
          currency: primaryCurrency,
        } as any)
        .select('id')
        .single();

      if (error) throw error;

      toast.success('Stripe account connected! Syncing transactions...');

      // Upsert into accounts table for data hygiene
      try {
        await supabase.from('accounts').upsert(
          { name: accountName.trim() || 'Stripe', user_id: user.id } as any,
          { onConflict: 'name,user_id' }
        );
      } catch {}

      if (inserted) {
        supabase.functions.invoke('stripe-sync', {
          body: { connection_id: (inserted as any).id },
        }).then((res) => {
          if (res.data && !res.error) {
            toast.success(`Stripe sync complete: ${res.data.synced} transactions imported`);
          }
        }).catch(() => {});
      }

      onSuccess();
      reset();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect Stripe');
    } finally {
      setConnecting(false);
    }
  };

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      reset();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap size={18} style={{ color: STRIPE_COLOR }} />
            {step === 1 && 'Connect Stripe Account'}
            {step === 2 && 'Confirm & Connect'}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && 'Enter your Stripe Restricted API Key to discover your account.'}
            {step === 2 && 'Review your Stripe account details and connect.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${s > step ? 'bg-muted' : ''}`}
              style={s <= step ? { backgroundColor: STRIPE_COLOR } : undefined}
            />
          ))}
        </div>

        {/* Step 1: Enter API Key */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">
                Restricted API Key
              </label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="rk_live_... or sk_live_..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Find this at dashboard.stripe.com → Developers → API Keys
              </p>
            </div>
            <Button
              onClick={handleDiscover}
              disabled={!apiKey.trim() || discovering}
              className="w-full text-white"
              style={{ backgroundColor: STRIPE_COLOR }}
            >
              {discovering ? (
                <Loader2 size={16} className="animate-spin mr-2" />
              ) : (
                <Search size={16} className="mr-2" />
              )}
              Discover Account
            </Button>
          </div>
        )}

        {/* Step 2: Confirm & Connect */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Account info */}
            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: `${STRIPE_COLOR}15` }}>
              <CheckCircle size={16} style={{ color: STRIPE_COLOR }} />
              <div>
                <span className="text-sm font-medium text-foreground">{email || accountId}</span>
                {email && accountId && (
                  <p className="text-xs text-muted-foreground">{accountId}</p>
                )}
              </div>
            </div>

            {/* Balances table */}
            {balances.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted/50">
                  <span className="text-xs font-bold text-muted-foreground uppercase">Account Balances</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">Currency</th>
                      <th className="text-right px-3 py-2 font-medium">Available</th>
                      <th className="text-right px-3 py-2 font-medium">Pending</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((b) => (
                      <tr key={b.currency} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-medium">{b.currency}</td>
                        <td className="px-3 py-2 text-right">
                          {b.available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {b.pending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {b.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Account Name */}
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">
                Account Name
              </label>
              <Input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g. Stripe Business"
              />
            </div>

            <div className="flex gap-2 justify-between pt-1">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft size={14} className="mr-1" /> Back
              </Button>
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={connecting}
                className="text-white"
                style={{ backgroundColor: STRIPE_COLOR }}
              >
                {connecting ? (
                  <Loader2 size={14} className="animate-spin mr-1" />
                ) : (
                  <Zap size={14} className="mr-1" />
                )}
                Connect
                <ArrowRight size={14} className="ml-1" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StripeConnectionWizard;
