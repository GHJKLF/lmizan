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
  CreditCard,
} from 'lucide-react';

interface DiscoveredBalance {
  currency: string;
  primary: boolean;
  available: number;
  withheld: number;
  total: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PayPalConnectionWizard: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState(1);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [environment, setEnvironment] = useState<'live' | 'sandbox'>('live');
  const [discovering, setDiscovering] = useState(false);
  const [email, setEmail] = useState('');
  const [balances, setBalances] = useState<DiscoveredBalance[]>([]);
  const [accountName, setAccountName] = useState('');
  const [connecting, setConnecting] = useState(false);

  const reset = () => {
    setStep(1);
    setClientId('');
    setClientSecret('');
    setShowSecret(false);
    setEnvironment('live');
    setDiscovering(false);
    setEmail('');
    setBalances([]);
    setAccountName('');
    setConnecting(false);
  };

  const handleDiscover = async () => {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setDiscovering(true);
    try {
      const res = await supabase.functions.invoke('paypal-discover', {
        body: { client_id: clientId.trim(), client_secret: clientSecret.trim(), environment },
      });
      if (res.error) throw new Error(res.error.message || 'Discovery failed');
      if (res.data?.error) throw new Error(res.data.error);
      setEmail(res.data.email || '');
      setBalances(res.data.balances || []);
      setAccountName(res.data.email || 'PayPal');
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || 'Failed to discover PayPal account');
    } finally {
      setDiscovering(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const primaryCurrency = balances.find(b => b.primary)?.currency || balances[0]?.currency || 'USD';

      const { data: inserted, error } = await supabase
        .from('paypal_connections' as any)
        .insert({
          user_id: user.id,
          account_name: accountName.trim() || 'PayPal',
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          email: email,
          currency: primaryCurrency,
          environment: environment,
        } as any)
        .select('id')
        .single();

      if (error) throw error;

      toast.success('PayPal account connected! Syncing transactions...');

      // Insert into accounts table so it appears in sidebar
      try {
        await supabase.from('accounts').insert(
          { name: accountName.trim() || 'PayPal', user_id: user.id }
        );
      } catch {
        // Ignore duplicate — account already exists
      }

      // Trigger initial sync
      if (inserted) {
        supabase.functions.invoke('paypal-sync', {
          body: { connection_id: (inserted as any).id },
        }).then((res) => {
          if (res.data && !res.error) {
            toast.success(`PayPal sync complete: ${res.data.synced} transactions imported`);
          }
        }).catch(() => {});
      }

      onSuccess();
      reset();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect PayPal');
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
            <CreditCard size={18} className="text-[#0070ba]" />
            {step === 1 && 'Connect PayPal Account'}
            {step === 2 && 'Confirm & Connect'}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && 'Enter your PayPal API credentials to discover your account.'}
            {step === 2 && 'Review your PayPal account details and connect.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-[#0070ba]' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Enter Credentials */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">
                Client ID
              </label>
              <Input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="PayPal REST API Client ID"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">
                Client Secret
              </label>
              <div className="relative">
                <Input
                  type={showSecret ? 'text' : 'password'}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="PayPal REST API Secret"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Find these at developer.paypal.com → Dashboard → My Apps & Credentials
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">
                Environment
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={environment === 'live' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEnvironment('live')}
                  className="flex-1"
                >
                  Live
                </Button>
                <Button
                  type="button"
                  variant={environment === 'sandbox' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEnvironment('sandbox')}
                  className="flex-1"
                >
                  Sandbox
                </Button>
              </div>
            </div>
            <Button
              onClick={handleDiscover}
              disabled={!clientId.trim() || !clientSecret.trim() || discovering}
              className="w-full"
              style={{ backgroundColor: '#0070ba' }}
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
            {/* Email */}
            {email && (
              <div className="flex items-center gap-2 p-3 bg-[#0070ba]/10 rounded-lg">
                <CheckCircle size={16} className="text-[#0070ba]" />
                <span className="text-sm font-medium text-foreground">{email}</span>
              </div>
            )}

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
                      <th className="text-right px-3 py-2 font-medium">Reserved</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((b) => (
                      <tr key={b.currency} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-medium">
                          {b.currency}
                          {b.primary && (
                            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[#0070ba]/20 text-[#0070ba] ml-2">
                              Primary
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{b.available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{b.withheld.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right font-semibold">{b.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
                placeholder="e.g. PayPal Business"
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
                style={{ backgroundColor: '#0070ba' }}
              >
                {connecting ? (
                  <Loader2 size={14} className="animate-spin mr-1" />
                ) : (
                  <CreditCard size={14} className="mr-1" />
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

export default PayPalConnectionWizard;
