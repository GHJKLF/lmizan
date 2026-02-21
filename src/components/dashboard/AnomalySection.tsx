import React, { useState, useEffect, useCallback } from 'react';
import { DataService } from '@/services/dataService';
import { AccountAnomaly } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, ShieldAlert, ShieldX, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  refreshKey: number;
}

const severityConfig = {
  warning: { label: 'Warning', color: 'bg-[hsl(38_92%_50%/0.1)] text-[hsl(38,92%,50%)] border-[hsl(38_92%_50%/0.3)]', icon: AlertTriangle },
  alert: { label: 'Alert', color: 'bg-[hsl(25_95%_53%/0.1)] text-[hsl(25,95%,53%)] border-[hsl(25_95%_53%/0.3)]', icon: ShieldAlert },
  critical: { label: 'Critical', color: 'bg-[hsl(0_84%_60%/0.1)] text-destructive border-destructive/30', icon: ShieldX },
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-EU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const AnomalySection: React.FC<Props> = ({ refreshKey }) => {
  const [anomalies, setAnomalies] = useState<AccountAnomaly[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await DataService.fetchAnomalies(showAll);
      setAnomalies(data as AccountAnomaly[]);
    } catch (e) {
      console.error('Failed to load anomalies:', e);
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const handleAction = async (id: string, status: 'dismissed' | 'expected') => {
    try {
      await DataService.updateAnomalyStatus(id, status);
      toast.success(status === 'dismissed' ? 'Anomaly dismissed' : 'Marked as expected');
      load();
    } catch {
      toast.error('Failed to update anomaly');
    }
  };

  const openCount = anomalies.filter(a => a.status === 'open').length;
  const warnings = anomalies.filter(a => a.status === 'open' && a.severity === 'warning').length;
  const alerts = anomalies.filter(a => a.status === 'open' && a.severity === 'alert').length;
  const criticals = anomalies.filter(a => a.status === 'open' && a.severity === 'critical').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-[11px] font-semibold text-muted-foreground tracking-[0.05em] uppercase">Anomaly Detection</h3>
          {openCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {openCount} open
              {warnings > 0 && <span className="text-[hsl(38,92%,50%)] ml-1">• {warnings} warning</span>}
              {alerts > 0 && <span className="text-[hsl(25,95%,53%)] ml-1">• {alerts} alert</span>}
              {criticals > 0 && <span className="text-destructive ml-1">• {criticals} critical</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {showAll ? <Eye size={14} /> : <EyeOff size={14} />}
          <span>Show all</span>
          <Switch checked={showAll} onCheckedChange={setShowAll} />
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2 border-border hover:bg-transparent">
              <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background">Account</TableHead>
              <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background">Date</TableHead>
              <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">Expected</TableHead>
              <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">Actual</TableHead>
              <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">Gap</TableHead>
              <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background">Severity</TableHead>
              <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background">Status</TableHead>
              <TableHead className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground bg-background text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {anomalies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">
                  No anomalies found
                </TableCell>
              </TableRow>
            ) : (
              anomalies.map((a) => {
                const cfg = severityConfig[a.severity];
                const Icon = cfg.icon;
                return (
                  <TableRow key={a.id} className="h-12 border-b border-border/30 hover:bg-background">
                    <TableCell className="text-xs font-medium">{a.account}</TableCell>
                    <TableCell className="text-xs">{a.detected_date}</TableCell>
                    <TableCell className="text-xs text-right font-mono tabular-nums font-medium">{fmt(a.expected_balance)}</TableCell>
                    <TableCell className="text-xs text-right font-mono tabular-nums font-medium">{fmt(a.actual_balance)}</TableCell>
                    <TableCell className="text-xs text-right font-mono tabular-nums font-semibold">
                      {a.gap_amount > 0 ? '+' : ''}{fmt(a.gap_amount)}
                      {a.gap_percent != null && (
                        <span className="text-muted-foreground ml-1">({a.gap_percent}%)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                        <Icon size={10} className="mr-0.5" />
                        {cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs capitalize">{a.status}</span>
                      {a.auto_resolve_reason && (
                        <span className="text-[10px] text-muted-foreground block">{a.auto_resolve_reason.replace(/_/g, ' ')}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.status === 'open' && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleAction(a.id, 'expected')}>
                            Expected
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleAction(a.id, 'dismissed')}>
                            Dismiss
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AnomalySection;
