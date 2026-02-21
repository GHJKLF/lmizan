import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  BarChart2,
  Scale,
  Sparkles,
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
  Pencil,
  X,
  Trash2,
  Globe,
} from 'lucide-react';
import { ViewState } from '@/types';
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

interface SidebarProps {
  currentView: ViewState;
  onViewChange: (view: ViewState) => void;
  accounts: string[];
  selectedAccount: string | 'ALL';
  onSelectAccount: (account: string | 'ALL') => void;
  onRenameAccount: (oldName: string, newName: string) => void;
  onDeleteAccount: (accountName: string) => void;
  onLogout: () => void;
}

const classifyTier = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('asset')) return 'ASSET';
  if (n.includes('binance')) return 'CRYPTO';
  if (n.includes('paypal') || n.includes('stripe') || n.includes('payoneer') || n.includes('woo') || n.includes('airwallex') || n.includes('worldfirst')) return 'PROCESSOR';
  return 'LIQUID_BANK';
};

const TIER_LABELS: Record<string, string> = {
  LIQUID_BANK: 'BANKING',
  PROCESSOR: 'PROCESSORS',
  CRYPTO: 'CRYPTO',
  ASSET: 'FIXED ASSETS',
};

const TIER_DOT_COLORS: Record<string, string> = {
  LIQUID_BANK: 'bg-[hsl(var(--color-indigo))]',
  PROCESSOR: 'bg-[hsl(263,70%,58%)]',
  CRYPTO: 'bg-[hsl(var(--color-amber))]',
  ASSET: 'bg-[hsl(var(--color-emerald))]',
};

const NAV_ITEMS = [
  { view: 'DASHBOARD' as ViewState, icon: LayoutDashboard, label: 'Overview' },
  { view: 'TRANSACTIONS' as ViewState, icon: ArrowLeftRight, label: 'Transactions' },
  { view: 'PNL' as ViewState, icon: BarChart2, label: 'P&L' },
  { view: 'EQUITY' as ViewState, icon: Scale, label: 'Equity' },
  { view: 'AI_INSIGHTS' as ViewState, icon: Sparkles, label: 'AI Analyst' },
];

const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onViewChange,
  accounts,
  selectedAccount,
  onSelectAccount,
  onRenameAccount,
  onDeleteAccount,
  onLogout,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [renameModal, setRenameModal] = useState<{ open: boolean; oldName: string; newName: string }>({ open: false, oldName: '', newName: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; accountName: string }>({ open: false, accountName: '' });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; account: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) setContextMenu(null);
    };
    if (contextMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  const groupedAccounts = useMemo(() => {
    const groups: Record<string, string[]> = { LIQUID_BANK: [], PROCESSOR: [], CRYPTO: [], ASSET: [] };
    accounts.forEach((acc) => {
      const tier = classifyTier(acc);
      if (groups[tier]) groups[tier].push(acc);
    });
    return groups;
  }, [accounts]);

  const toggleGroup = (group: string) => setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRenameAccount(renameModal.oldName, renameModal.newName);
    setRenameModal({ open: false, oldName: '', newName: '' });
  };

  return (
    <>
      <aside className="w-64 shrink-0 h-screen flex flex-col fixed left-0 top-0 z-20 overflow-y-auto" style={{ background: 'hsl(var(--color-navy))' }}>
        {/* Logo */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5">
            <Scale size={20} className="text-white" />
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Lmizan</h1>
              <p className="text-[11px] font-medium" style={{ color: 'hsl(var(--color-indigo))' }}>Finance OS</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 px-3 pb-4 space-y-6">
          <nav className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const isActive = currentView === item.view;
              return (
                <div
                  key={item.view}
                  onClick={() => { onViewChange(item.view); onSelectAccount('ALL'); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] cursor-pointer transition-all ${
                    isActive
                      ? 'text-white font-medium border-l-[3px]'
                      : 'text-[hsl(var(--color-text-2))] hover:text-[hsl(213,19%,80%)]'
                  }`}
                  style={isActive ? { background: 'rgba(79,110,247,0.15)', borderColor: 'hsl(var(--color-indigo))', paddingLeft: '9px' } : { borderLeft: '3px solid transparent' }}
                >
                  <item.icon size={18} />
                  <span className="font-medium">{item.label}</span>
                </div>
              );
            })}
          </nav>

          {/* Portfolios */}
          <div>
            <div className="h-px mx-3 mb-4" style={{ background: 'hsl(var(--color-navy-mid))' }} />
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#475569' }}>
              Portfolios
            </p>

            <div
              onClick={() => { onSelectAccount('ALL'); onViewChange('DASHBOARD'); }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] cursor-pointer mb-2 transition-all ${
                selectedAccount === 'ALL' ? 'text-white font-medium' : 'text-[hsl(var(--color-text-2))] hover:text-[hsl(213,19%,80%)]'
              }`}
              style={selectedAccount === 'ALL' ? { background: 'rgba(255,255,255,0.06)' } : {}}
            >
              <Globe size={14} />
              All Portfolios
            </div>

            <div className="space-y-1">
              {Object.entries(groupedAccounts).map(([tier, tierAccounts]) => {
                if (tierAccounts.length === 0) return null;
                const isExpanded = expandedGroups[tier];

                return (
                  <div key={tier}>
                    <div
                      onClick={() => toggleGroup(tier)}
                      className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:text-[hsl(213,19%,80%)] group"
                      style={{ color: '#475569' }}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">{TIER_LABELS[tier]}</span>
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </div>

                    {isExpanded && (
                      <div className="mt-0.5 space-y-0.5 ml-2">
                        {tierAccounts.map((account) => {
                          const isSelected = selectedAccount === account;
                          return (
                            <div
                              key={account}
                              onClick={() => { onSelectAccount(account); onViewChange('DASHBOARD'); }}
                              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, account }); }}
                              className="group flex items-center justify-between px-3 py-1.5 rounded-md text-[13px] cursor-pointer transition-colors"
                              style={{ color: isSelected ? 'white' : 'hsl(var(--color-text-2))' }}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-[hsl(var(--color-indigo))]' : TIER_DOT_COLORS[tier] || 'bg-[#475569]'}`} style={!isSelected ? { opacity: 0.5 } : {}} />
                                <span className="truncate">{account}</span>
                              </div>
                              <div
                                onClick={(e) => { e.stopPropagation(); setRenameModal({ open: true, oldName: account, newName: account }); }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all"
                              >
                                <Pencil size={10} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3" style={{ borderTop: '1px solid hsl(var(--color-navy-mid))' }}>
          <div
            onClick={() => onViewChange('SETTINGS')}
            className="flex items-center gap-3 px-3 py-2 text-[hsl(var(--color-text-2))] hover:text-[hsl(213,19%,80%)] cursor-pointer hover:bg-white/5 rounded-lg transition-colors"
          >
            <Settings size={16} />
            <span className="text-[13px] font-medium">Settings</span>
          </div>
          <div
            onClick={onLogout}
            className="flex items-center gap-3 px-3 py-2 text-[hsl(var(--color-text-2))] hover:text-[hsl(var(--color-red))] cursor-pointer hover:bg-[hsl(var(--color-red)/0.1)] rounded-lg transition-colors"
          >
            <LogOut size={16} />
            <span className="text-[13px] font-medium">Logout</span>
          </div>
        </div>
      </aside>

      {/* Context Menu */}
      {contextMenu && (
        <div ref={contextMenuRef} className="fixed z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button onClick={() => { setDeleteConfirm({ open: true, accountName: contextMenu.account }); setContextMenu(null); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 size={14} />
            Delete Account
          </button>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => !open && setDeleteConfirm({ open: false, accountName: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm.accountName}</strong>? This will permanently delete the account AND all its associated transactions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { onDeleteAccount(deleteConfirm.accountName); setDeleteConfirm({ open: false, accountName: '' }); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Modal */}
      {renameModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-card rounded-xl w-full max-w-sm shadow-2xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-foreground">Rename Portfolio</h3>
              <button onClick={() => setRenameModal({ open: false, oldName: '', newName: '' })} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Portfolio Name</label>
                <input type="text" required autoFocus className="w-full p-2 border border-input rounded-lg focus:ring-2 focus:ring-ring/20 focus:border-ring outline-none bg-background" value={renameModal.newName} onChange={(e) => setRenameModal((prev) => ({ ...prev, newName: e.target.value }))} />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setRenameModal({ open: false, oldName: '', newName: '' })} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg">Cancel</button>
                <button type="submit" disabled={!renameModal.newName.trim() || renameModal.newName === renameModal.oldName} className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/85 rounded-lg disabled:opacity-50">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
