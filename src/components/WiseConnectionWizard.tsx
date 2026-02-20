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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  CheckCircle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  Search,
  Wifi,
} from 'lucide-react';

interface WiseProfile {
  id: number;
  fullName: string;
  type: string;
  balances: WiseBalance[];
}

interface WiseBalance {
  id: number;
  currency: string;
  amount: { value: number; currency: string };
  isConnected: boolean;
}

interface SelectedBalance {
  profileId: number;
  profileName: string;
  balanceId: number;
  currency: string;
}

interface ConnectionResult {
  currency: string;
  status: 'pending' | 'creating' | 'syncing' | 'done' | 'error';
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

const WiseConnectionWizard: React.FC<Props> = ({ open, onOpenChange, onComplete }) => {
  const [step, setStep] = useState(1);
  const [apiToken, setApiToken] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [profiles, setProfiles] = useState<WiseProfile[]>([]);
  const [selected, setSelected] = useState<SelectedBalance[]>([]);
  const [publicKeyPem, setPublicKeyPem] = useState('');
  const [privateKeyPem, setPrivateKeyPem] = useState('');
  const [keyGenerated, setKeyGenerated] = useState(false);
  const [keyUploaded, setKeyUploaded] = useState(false);
  const [results, setResults] = useState<ConnectionResult[]>([]);
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setStep(1);
    setApiToken('');
    setDiscovering(false);
    setProfiles([]);
    setSelected([]);
    setPublicKeyPem('');
    setPrivateKeyPem('');
    setKeyGenerated(false);
    setKeyUploaded(false);
    setResults([]);
    setCreating(false);
  };

  const handleDiscover = async () => {
    if (!apiToken.trim()) return;
    setDiscovering(true);
    try {
      const res = await supabase.functions.invoke('wise-discover', {
        body: { api_token: apiToken.trim() },
      });
      if (res.error) throw new Error(res.error.message || 'Discovery failed');
      if (res.data?.error) throw new Error(res.data.error);
      setProfiles(res.data.profiles || []);
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || 'Failed to discover accounts');
    } finally {
      setDiscovering(false);
    }
  };

  const toggleBalance = (profileId: number, profileName: string, balanceId: number, currency: string) => {
    setSelected((prev) => {
      const exists = prev.find((s) => s.balanceId === balanceId);
      if (exists) return prev.filter((s) => s.balanceId !== balanceId);
      return [...prev, { profileId, profileName, balanceId, currency }];
    });
  };

  const generateKeyPair = async () => {
    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSASSA-PKCS1-v1_5',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['sign', 'verify']
      );

      const pubExported = await crypto.subtle.exportKey('spki', keyPair.publicKey);
      const privExported = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

      const toBase64Lines = (buf: ArrayBuffer) => {
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        return b64.match(/.{1,64}/g)?.join('\n') || b64;
      };

      setPublicKeyPem(
        `-----BEGIN PUBLIC KEY-----\n${toBase64Lines(pubExported)}\n-----END PUBLIC KEY-----`
      );
      setPrivateKeyPem(
        `-----BEGIN PRIVATE KEY-----\n${toBase64Lines(privExported)}\n-----END PRIVATE KEY-----`
      );
      setKeyGenerated(true);
    } catch (err: any) {
      toast.error('Failed to generate RSA key pair');
      console.error(err);
    }
  };

  const handleGoToStep3 = () => {
    generateKeyPair();
    setStep(3);
  };

  const downloadPublicKey = () => {
    const blob = new Blob([publicKeyPem], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lmizan-wise-public-key.pem';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Public key downloaded');
  };

  const handleConnect = async () => {
    setCreating(true);
    setStep(4);

    const initialResults: ConnectionResult[] = selected.map((s) => ({
      currency: s.currency,
      status: 'pending',
    }));
    setResults(initialResults);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Not authenticated');
      setCreating(false);
      return;
    }

    const updatedResults = [...initialResults];

    for (let i = 0; i < selected.length; i++) {
      const sel = selected[i];
      updatedResults[i] = { ...updatedResults[i], status: 'creating' };
      setResults([...updatedResults]);

      try {
        const { error } = await supabase.from('wise_connections').insert({
          user_id: user.id,
          account_name: `Wise ${sel.profileName}`,
          api_token: apiToken.trim(),
          profile_id: String(sel.profileId),
          balance_id: String(sel.balanceId),
          currency: sel.currency,
          private_key: privateKeyPem,
          webhook_secret:
            crypto.randomUUID().replace(/-/g, '') +
            crypto.randomUUID().replace(/-/g, ''),
        } as any);

        if (error) throw error;

        // Find the newly created connection to trigger sync
        updatedResults[i] = { ...updatedResults[i], status: 'syncing' };
        setResults([...updatedResults]);

        const { data: newConns } = await supabase
          .from('wise_connections' as any)
          .select('id')
          .eq('user_id', user.id)
          .eq('balance_id', String(sel.balanceId))
          .order('created_at', { ascending: false })
          .limit(1);

        if (newConns && newConns.length > 0) {
          await supabase.functions.invoke('wise-sync', {
            body: { wise_connection_id: (newConns[0] as any).id, full_sync: true },
          });
        }

        // Upsert into accounts table so it appears in sidebar
        const wiseName = `Wise ${sel.profileName}`;
        const { error: acctErr } = await supabase
          .from('accounts')
          .upsert(
            { name: wiseName, user_id: user.id },
            { onConflict: 'name,user_id', ignoreDuplicates: true }
          );
        if (acctErr) {
          console.warn('Wise accounts upsert failed, trying insert:', acctErr.message);
          const { error: fallback } = await supabase
            .from('accounts')
            .insert({ name: wiseName, user_id: user.id });
          if (fallback && !fallback.message?.includes('duplicate')) {
            console.error('Failed to insert Wise account:', fallback.message);
          }
        }

        updatedResults[i] = { ...updatedResults[i], status: 'done' };
      } catch (err: any) {
        updatedResults[i] = {
          ...updatedResults[i],
          status: 'error',
          error: err.message || 'Failed',
        };
      }
      setResults([...updatedResults]);
    }
    setCreating(false);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      if (step === 4 && !creating) {
        onComplete();
        reset();
      } else if (step < 4) {
        reset();
      }
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wifi size={18} className="text-emerald-500" />
            {step === 1 && 'Connect Wise Account'}
            {step === 2 && 'Select Accounts'}
            {step === 3 && 'Set Up RSA Key'}
            {step === 4 && 'Connecting...'}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && 'Enter your Wise API token to discover your accounts.'}
            {step === 2 && 'Choose which currency balances to connect.'}
            {step === 3 && 'Upload the public key to Wise for full transaction sync.'}
            {step === 4 && 'Creating connections and starting initial sync.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-2">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Enter Token */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase mb-1.5">
                Wise API Token
              </label>
              <Input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Enter your personal API token"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Find it at wise.com → Settings → API tokens
              </p>
            </div>
            <Button
              onClick={handleDiscover}
              disabled={!apiToken.trim() || discovering}
              className="w-full"
            >
              {discovering ? (
                <Loader2 size={16} className="animate-spin mr-2" />
              ) : (
                <Search size={16} className="mr-2" />
              )}
              Discover Accounts
            </Button>
          </div>
        )}

        {/* Step 2: Select Accounts */}
        {step === 2 && (
          <div className="space-y-4">
            {profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No profiles found for this token.
              </p>
            ) : (
              profiles.map((profile) => (
                <div key={profile.id} className="border border-border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-muted/50">
                    <span className="text-sm font-semibold">{profile.fullName}</span>
                    <span className="text-xs text-muted-foreground ml-2 capitalize">
                      {profile.type.toLowerCase()}
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {profile.balances.map((bal) => {
                      const isSelected = selected.some((s) => s.balanceId === bal.id);
                      return (
                        <label
                          key={bal.id}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent/50 transition-colors ${
                            bal.isConnected ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          <Checkbox
                            checked={isSelected || bal.isConnected}
                            disabled={bal.isConnected}
                            onCheckedChange={() =>
                              !bal.isConnected &&
                              toggleBalance(profile.id, profile.fullName, bal.id, bal.currency)
                            }
                          />
                          <span className="text-sm font-medium flex-1">{bal.currency}</span>
                          <span className="text-sm text-muted-foreground">
                            {bal.amount.value.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          {bal.isConnected && (
                            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                              Connected
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            <div className="flex gap-2 justify-between pt-1">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft size={14} className="mr-1" /> Back
              </Button>
              <Button size="sm" onClick={handleGoToStep3} disabled={selected.length === 0}>
                Next <ArrowRight size={14} className="ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: RSA Key */}
        {step === 3 && (
          <div className="space-y-4">
            {!keyGenerated ? (
              <div className="flex justify-center py-8">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <Button onClick={downloadPublicKey} variant="outline" className="w-full">
                  <KeyRound size={16} className="mr-2" />
                  Download Public Key (.pem)
                </Button>
                <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-1.5">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <KeyRound size={12} /> Upload to Wise
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Go to <span className="font-medium text-foreground">wise.com → Settings → API tokens → Manage public keys</span>,
                    then upload the downloaded .pem file. This enables full transaction sync (incoming + outgoing).
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={keyUploaded}
                    onCheckedChange={(v) => setKeyUploaded(v === true)}
                  />
                  <span className="text-sm">I have uploaded the public key to Wise</span>
                </label>
                <div className="flex gap-2 justify-between pt-1">
                  <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                    <ArrowLeft size={14} className="mr-1" /> Back
                  </Button>
                  <Button size="sm" onClick={handleConnect} disabled={!keyUploaded}>
                    Connect {selected.length} Account{selected.length !== 1 ? 's' : ''}
                    <ArrowRight size={14} className="ml-1" />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Creating */}
        {step === 4 && (
          <div className="space-y-3">
            {results.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 border border-border rounded-lg"
              >
                {r.status === 'pending' && (
                  <div className="w-5 h-5 rounded-full border-2 border-muted" />
                )}
                {r.status === 'creating' && (
                  <Loader2 size={18} className="animate-spin text-primary" />
                )}
                {r.status === 'syncing' && (
                  <Loader2 size={18} className="animate-spin text-amber-500" />
                )}
                {r.status === 'done' && (
                  <CheckCircle size={18} className="text-emerald-500" />
                )}
                {r.status === 'error' && (
                  <XCircle size={18} className="text-destructive" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{r.currency}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {r.status === 'creating' && 'Creating...'}
                    {r.status === 'syncing' && 'Syncing transactions...'}
                    {r.status === 'done' && 'Connected & synced'}
                    {r.status === 'error' && (r.error || 'Failed')}
                    {r.status === 'pending' && 'Waiting...'}
                  </span>
                </div>
              </div>
            ))}
            {!creating && (
              <Button
                className="w-full mt-2"
                onClick={() => {
                  onComplete();
                  reset();
                  onOpenChange(false);
                }}
              >
                Done
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WiseConnectionWizard;
