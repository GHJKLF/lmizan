import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';

interface SyncProgressProps {
  connectionId: string;
  provider: 'paypal' | 'wise' | 'stripe';
  accountName: string;
}

const providerStyles: Record<string, { color: string; bg: string; label: string }> = {
  paypal: { color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950', label: 'PayPal' },
  wise: { color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950', label: 'Wise' },
  stripe: { color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950', label: 'Stripe' },
};

const SyncProgress: React.FC<SyncProgressProps> = ({ connectionId, provider, accountName }) => {
  const [session, setSession] = useState<{
    status: string;
    total_chunks: number;
    completed_chunks: number;
    total_records: number;
  } | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Initial fetch
    supabase
      .from('sync_sessions')
      .select('status, total_chunks, completed_chunks, total_records')
      .eq('connection_id', connectionId)
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.length) setSession(data[0]);
      });

    // Realtime subscription
    const channel = supabase
      .channel(`sync-progress-${connectionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sync_sessions',
          filter: `connection_id=eq.${connectionId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (row) {
            setSession({
              status: row.status,
              total_chunks: row.total_chunks,
              completed_chunks: row.completed_chunks,
              total_records: row.total_records,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [connectionId]);

  // Auto-hide after completion
  useEffect(() => {
    if (session?.status === 'completed') {
      const timer = setTimeout(() => setHidden(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [session?.status]);

  if (!session || hidden) return null;

  const style = providerStyles[provider];
  const progress =
    session.total_chunks > 0
      ? Math.round((session.completed_chunks / session.total_chunks) * 100)
      : 0;
  const remaining = (session.total_chunks - session.completed_chunks) * 2;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const etaLabel = mins > 0 ? `~${mins}m ${secs}s remaining` : `~${secs}s remaining`;

  return (
    <div className={`rounded-lg border border-border p-3 ${style.bg} text-sm space-y-2 w-80 relative`}>
      <button
        onClick={() => setHidden(true)}
        className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
      <div className="flex items-center gap-2 pr-6">
        <span className={`font-semibold ${style.color}`}>{style.label}</span>
        <span className="text-muted-foreground truncate">{accountName}</span>
      </div>

      {session.status === 'running' && (
        <>
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Loader2 size={12} className="animate-spin" />
            Syncing historical data...
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {session.completed_chunks} / {session.total_chunks} chunks •{' '}
              {session.total_records.toLocaleString()} transactions
            </span>
            <span>{etaLabel}</span>
          </div>
        </>
      )}

      {session.status === 'completed' && (
        <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
          <CheckCircle2 size={14} />
          Historical sync complete — {session.total_records.toLocaleString()} transactions imported
        </div>
      )}

      {session.status === 'failed' && (
        <div className="flex items-center gap-1.5 text-destructive text-xs font-medium">
          <AlertCircle size={14} />
          Sync failed. Please retry from Settings.
        </div>
      )}
    </div>
  );
};

export default SyncProgress;
