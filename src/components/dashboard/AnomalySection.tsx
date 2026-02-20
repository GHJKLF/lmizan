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
  warning: { label: 'Warning', color: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30', icon: AlertTriangle },
  alert: { label: 'Alert', color: 'bg-orange-500/15 text-orange-700 border-orange-500/30', icon: ShieldAlert },
  critical: { label: 'Critical', color: 'bg-red-500/15 text-red-700 border-red-500/30', icon: ShieldX },
};

const rowBg = {
  warning: 'bg-yellow-500/5',
  alert: 'bg-orange-500/5',
  critical: 'bg-red-500/5',
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

  if (loading && anomalies.length === 0) return null;
  if (!showAll && anomalies.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground tracking-wide uppercase">Anomaly Detection</h3>
          {openCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {openCount} open
              {warnings > 0 && <span className="text-yellow-600 ml-1">• {warnings} warning</span>}
              {alerts > 0 && <span className="text-orange-600 ml-1">• {alerts} alert</span>}
              {criticals > 0 && <span className="text-red-600 ml-1">• {criticals} critical</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {showAll ? <Eye size={14} /> : <EyeOff size={14} />}
          <span>Show all</span>
          <Switch checked={showAll} onCheckedChange={setShowAll} />
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs">Account</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs text-right">Expected</TableHead>
              <TableHead className="text-xs text-right">Actual</TableHead>
              <TableHead className="text-xs text-right">Gap</TableHead>
              <TableHead className="text-xs">Severity</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
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
                  <TableRow key={a.id} className={`${rowBg[a.severity]} hover:opacity-90`}>
                    <TableCell className="text-xs font-medium">{a.account}</TableCell>
                    <TableCell className="text-xs">{a.detected_date}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{fmt(a.expected_balance)}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{fmt(a.actual_balance)}</TableCell>
                    <TableCell className="text-xs text-right font-mono font-semibold">
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
