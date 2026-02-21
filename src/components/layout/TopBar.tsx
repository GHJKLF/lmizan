import React, { useRef, useState, useEffect } from 'react';
import { RefreshCw, Upload, Scale, ArrowLeftRight, Loader2, ChevronDown, ShieldAlert } from 'lucide-react';

interface TopBarProps {
  title: string;
  onSync: (fullSync: boolean) => void;
  syncing: boolean;
  onImport: () => void;
  onUpdateBalance: () => void;
  onReconcile: () => void;
  onAnomalyCheck: () => void;
  runningAnomalyCheck: boolean;
}

const TopBar: React.FC<TopBarProps> = ({ title, onSync, syncing, onImport, onUpdateBalance, onReconcile, onAnomalyCheck, runningAnomalyCheck }) => {
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const syncMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (syncMenuRef.current && !syncMenuRef.current.contains(e.target as Node)) setSyncMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const ghostBtn = "flex items-center gap-1.5 px-3 h-8 text-[13px] font-medium text-foreground border border-border hover:bg-accent rounded-lg transition-colors disabled:opacity-50";

  return (
    <header className="h-[60px] bg-card border-b border-border flex items-center justify-between px-7 shrink-0 sticky top-0 z-10">
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      <div className="flex items-center gap-2">
        {/* Sync */}
        <div className="relative" ref={syncMenuRef}>
          <div className="flex items-stretch">
            <button onClick={() => onSync(false)} disabled={syncing} className={`${ghostBtn} rounded-r-none border-r-0`}>
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sync All
            </button>
            <button onClick={() => setSyncMenuOpen(!syncMenuOpen)} disabled={syncing} className="flex items-center px-1.5 h-8 text-foreground border border-border hover:bg-accent rounded-r-lg transition-colors disabled:opacity-50">
              <ChevronDown size={12} />
            </button>
          </div>
          {syncMenuOpen && (
            <div className="absolute right-0 mt-1 w-36 bg-popover border border-border rounded-lg shadow-lg z-50">
              <button onClick={() => { onSync(true); setSyncMenuOpen(false); }} className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-accent rounded-lg transition-colors">
                Full Sync
              </button>
            </div>
          )}
        </div>

        <button onClick={onAnomalyCheck} disabled={runningAnomalyCheck} className={ghostBtn}>
          {runningAnomalyCheck ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
          Anomaly Check
        </button>

        <button onClick={onReconcile} className={ghostBtn}>
          <ArrowLeftRight size={14} />
          Reconcile
        </button>

        <button onClick={onUpdateBalance} className={ghostBtn}>
          <Scale size={14} />
          Update Balance
        </button>

        <button onClick={onImport} className="flex items-center gap-1.5 px-3 h-8 text-[13px] font-medium text-primary-foreground bg-primary hover:bg-primary/85 rounded-lg transition-colors">
          <Upload size={14} />
          Import
        </button>
      </div>
    </header>
  );
};

export default TopBar;
