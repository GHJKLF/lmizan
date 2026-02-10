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
  XCircle,
  Copy,
  Wifi,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';

interface WiseProfile {
  id: number;
  fullName: string;
  type: string;
  balances: { id: number; currency: string; amount: { value: number; currency: string }; isConnected: boolean }[];
}

interface ConnectionResult {
  profileName: string;
  currency: string;
  status: 'done' | 'error';
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

type ProgressPhase =
  | 'discovering'
  | 'generating_keys'
  | 'uploading_keys'
  | 'creating_connections'
  | 'syncing'
  | 'done';

const phaseLabels: Record<ProgressPhase, string> = {
  discovering: 'Discovering accounts...',
  generating_keys: 'Generating security keys...',
  uploading_keys: 'Uploading keys to Wise...',
  creating_connections: 'Creating connections...',
  syncing: 'Syncing transactions...',
  done: 'Complete!',
};

const WiseConnectionWizard: React.FC<Props> = ({ open, onOpenChange, onComplete }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [apiToken, setApiToken] = useState('');
  const [processing, setProcessing] = useState(false);
  const [phase, setPhase] = useState<ProgressPhase>('discovering');
  const [results, setResults] = useState<ConnectionResult[]>([]);
  const [keyUploadFailed, setKeyUploadFailed] = useState(false);
  const [publicKeyPem, setPublicKeyPem] = useState('');

  const reset = () => {
    setStep(1);
    setApiToken('');
    setProcessing(false);
    setPhase('discovering');
    setResults([]);
    setKeyUploadFailed(false);
    setPublicKeyPem('');
  };

  const generateKeyPair = async () => {
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
    return {
      publicPem: `-----BEGIN PUBLIC KEY-----\n${toBase64Lines(pubExported)}\n-----END PUBLIC KEY-----`,
      privatePem: `-----BEGIN PRIVATE KEY-----\n${toBase64Lines(privExported)}\n-----END PRIVATE KEY-----`,
    };
  };

  const handleConnect = async () => {
    if (!apiToken.trim()) return;
    setProcessing(true);
    setStep(2);
    setPhase('discovering');

    try {
      // 1. Discover
      const discoverRes = await supabase.functions.invoke('wise-discover', {
        body: { api_token: apiToken.trim() },
      });
      if (discoverRes.error) throw new Error(discoverRes.error.message || 'Discovery failed');
      if (discoverRes.data?.error) throw new Error(discoverRes.data.error);

      const profiles: WiseProfile[] = discoverRes.data.profiles || [];
      const newBalances = profiles.flatMap((p) =>
        p.balances
          .filter((b) => !b.isConnected)
          .map((b) => ({ profileId: p.id, profileName: p.fullName, balanceId: b.id, currency: b.currency }))
      );

      if (newBalances.length === 0) {
        setResults([]);
        setPhase('done');
        setProcessing(false);
        toast.info('All accounts are already connected');
        return;
      }

      // 2. Generate RSA keys (one per profile)
      setPhase('generating_keys');
      const profileIds = [...new Set(newBalances.map((b) => b.profileId))];
      const keyMap = new Map<number, { publicPem: string; privatePem: string }>();
      for (const pid of profileIds) {
        keyMap.set(pid, await generateKeyPair());
      }

      // 3. Upload keys to Wise
      setPhase('uploading_keys');
      let anyKeyFailed = false;
      let savedPublicPem = '';
      for (const pid of profileIds) {
        const keys = keyMap.get(pid)!;
        try {
          const uploadRes = await supabase.functions.invoke('wise-upload-key', {
            body: {
              api_token: apiToken.trim(),
              label: `Lovable (auto-generated)`,
              public_key_pem: keys.publicPem,
            },
          });
          if (!uploadRes.data?.success) {
            anyKeyFailed = true;
            savedPublicPem = keys.publicPem;
          }
        } catch {
          anyKeyFailed = true;
          savedPublicPem = keys.publicPem;
        }
      }
      setKeyUploadFailed(anyKeyFailed);
      if (anyKeyFailed) setPublicKeyPem(savedPublicPem);

      // 4. Create connections
      setPhase('creating_connections');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const connectionResults: ConnectionResult[] = [];
      const createdIds: string[] = [];

      for (const bal of newBalances) {
        const keys = keyMap.get(bal.profileId)!;
        try {
          const { error } = await supabase.from('wise_connections').insert({
            user_id: user.id,
            account_name: bal.profileName,
            api_token: apiToken.trim(),
            profile_id: String(bal.profileId),
            balance_id: String(bal.balanceId),
            currency: bal.currency,
            private_key: keys.privatePem,
            webhook_secret: crypto.randomUUID(),
          } as any);
          if (error) throw error;

          // Get the created connection ID
          const { data: newConns } = await supabase
            .from('wise_connections' as any)
            .select('id')
            .eq('user_id', user.id)
            .eq('balance_id', String(bal.balanceId))
            .order('created_at', { ascending: false })
            .limit(1);

          if (newConns?.[0]) createdIds.push((newConns[0] as any).id);
          connectionResults.push({ profileName: bal.profileName, currency: bal.currency, status: 'done' });
        } catch (err: any) {
          connectionResults.push({
            profileName: bal.profileName,
            currency: bal.currency,
            status: 'error',
            error: err.message || 'Failed',
          });
        }
      }

      // 5. Sync all
      setPhase('syncing');
      for (const connId of createdIds) {
        try {
          await supabase.functions.invoke('wise-sync', {
            body: { wise_connection_id: connId, full_sync: true },
          });
        } catch {
          // Non-fatal — sync can be retried
        }
      }

      setResults(connectionResults);
      setPhase('done');
    } catch (err: any) {
      toast.error(err.message || 'Connection failed');
      setStep(1);
    } finally {
      setProcessing(false);
    }
  };

  const copyPublicKey = async () => {
    try {
      await navigator.clipboard.writeText(publicKeyPem);
      toast.success('Public key copied');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      if (!processing) {
        if (step === 2) onComplete();
        reset();
      }
    }
    onOpenChange(isOpen);
  };

  const successCount = results.filter((r) => r.status === 'done').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wifi size={18} className="text-emerald-500" />
            {step === 1 ? 'Connect Wise Account' : phase === 'done' ? 'Connected!' : 'Connecting...'}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Enter your Wise API token to automatically connect all your accounts.'
              : phase === 'done'
                ? `${successCount} account${successCount !== 1 ? 's' : ''} connected successfully.`
                : phaseLabels[phase]}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-2">
          {[1, 2].map((s) => (
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
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Find it at wise.com → Settings → API tokens
              </p>
            </div>
            <Button onClick={handleConnect} disabled={!apiToken.trim()} className="w-full">
              <Wifi size={16} className="mr-2" />
              Connect
            </Button>
          </div>
        )}

        {/* Step 2: Processing / Results */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Progress during processing */}
            {phase !== 'done' && (
              <div className="flex flex-col items-center py-8 gap-4">
                <Loader2 size={32} className="animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{phaseLabels[phase]}</p>
              </div>
            )}

            {/* Results */}
            {phase === 'done' && (
              <>
                {/* Key upload status banner */}
                {keyUploadFailed ? (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
                    <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle size={14} />
                      Manual key upload required
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Auto-upload of the security key failed. To enable full sync (incoming + outgoing),
                      upload this key at{' '}
                      <span className="font-medium text-foreground">
                        wise.com → Settings → API tokens → Manage public keys
                      </span>
                    </p>
                    <div className="relative">
                      <textarea
                        readOnly
                        value={publicKeyPem}
                        rows={5}
                        className="w-full p-2 pr-10 border border-input rounded-md bg-muted/30 text-[10px] font-mono resize-none text-foreground"
                      />
                      <button
                        onClick={copyPublicKey}
                        className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Without the key, only outgoing transactions will sync.
                    </p>
                  </div>
                ) : results.length > 0 ? (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <ShieldCheck size={14} />
                      Full sync enabled! All transaction types will be captured.
                    </p>
                  </div>
                ) : null}

                {/* Connection list */}
                {results.length > 0 ? (
                  <div className="space-y-1.5">
                    {results.map((r, i) => (
                      <div key={i} className="flex items-center gap-2.5 p-2.5 border border-border rounded-lg">
                        {r.status === 'done' ? (
                          <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle size={16} className="text-destructive shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{r.currency}</span>
                          <span className="text-xs text-muted-foreground ml-2">{r.profileName}</span>
                        </div>
                        {r.status === 'error' && (
                          <span className="text-[10px] text-destructive">{r.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    All accounts were already connected.
                  </p>
                )}

                <Button
                  className="w-full"
                  onClick={() => {
                    onComplete();
                    reset();
                    onOpenChange(false);
                  }}
                >
                  Done
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WiseConnectionWizard;
