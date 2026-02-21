import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Receipt,
  MessageSquareText,
  Settings,
  TrendingUp,
  Scale,
  LogOut,
  Building2,
  CreditCard,
  Bitcoin,
  Home,
  ChevronDown,
  ChevronRight,
  Pencil,
  X,
  Trash2,
  Wallet,
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

interface AppSidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  selectedAccount: string | 'ALL';
  onSelectAccount: (account: string | 'ALL') => void;
  accounts: string[];
  onRenameAccount: (oldName: string, newName: string) => void;
  onDeleteAccount: (accountName: string) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
}

const categorizeAccount = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('asset')) return 'Assets';
  if (n.includes('binance')) return 'Crypto';
  if (
    n.includes('paypal') ||
    n.includes('stripe') ||
    n.includes('payoneer') ||
    n.includes('woo') ||
    n.includes('airwallex') ||
    n.includes('worldfirst')
  )
    return 'Processors';
  return 'Banking';
};

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; label: string }> = {
  Banking: { icon: Building2, label: 'BANKING' },
  Processors: { icon: CreditCard, label: 'PROCESSORS' },
  Crypto: { icon: Bitcoin, label: 'CRYPTO' },
  Assets: { icon: Home, label: 'FIXED ASSETS' },
};

const AppSidebar: React.FC<AppSidebarProps> = ({
  currentView,
  onNavigate,
  selectedAccount,
  onSelectAccount,
  accounts,
  onRenameAccount,
  onDeleteAccount,
  onLogout,
  onOpenSettings,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    Banking: false,
    Processors: false,
    Crypto: false,
    Assets: false,
  });

  const [renameModal, setRenameModal] = useState<{ open: boolean; oldName: string; newName: string }>({
    open: false,
    oldName: '',
    newName: '',
  });

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; accountName: string }>({
    open: false,
    accountName: '',
  });

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; account: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  const navItems = [
    { view: 'DASHBOARD' as ViewState, icon: LayoutDashboard, label: 'Dashboard' },
    { view: 'PNL' as ViewState, icon: TrendingUp, label: 'P&L' },
    { view: 'EQUITY' as ViewState, icon: Scale, label: 'Equity' },
    { view: 'TRANSACTIONS' as ViewState, icon: Receipt, label: 'Transactions' },
    { view: 'AI_INSIGHTS' as ViewState, icon: MessageSquareText, label: 'AI Analyst' },
  ];

  const groupedAccounts = useMemo(() => {
    const groups: Record<string, string[]> = { Banking: [], Processors: [], Crypto: [], Assets: [] };
    accounts.forEach((acc) => {
      const cat = categorizeAccount(acc);
      if (groups[cat]) groups[cat].push(acc);
    });
    return groups;
  }, [accounts]);

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const openRenameModal = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    setRenameModal({ open: true, oldName: name, newName: name });
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRenameAccount(renameModal.oldName, renameModal.newName);
    setRenameModal({ open: false, oldName: '', newName: '' });
  };

  return (
    <>
      <aside className="w-60 bg-sidebar h-screen flex flex-col fixed left-0 top-0 z-20 overflow-y-auto">
        {/* Logo */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-2.5">
            <Scale size={20} className="text-primary" />
            <div>
              <h1 className="text-lg font-semibold text-sidebar-primary-foreground tracking-tight">Lmizan</h1>
              <p className="text-[11px] font-medium text-primary">Finance OS</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 px-3 pb-4 space-y-6">
          <nav className="space-y-0.5">
            {navItems.map((item) => {
              const isActive = currentView === item.view;
              return (
                <div
                  key={item.view}
                  onClick={() => onNavigate(item.view)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-primary-foreground border-l-[3px] border-primary pl-[9px]'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`}
                >
                  <item.icon size={16} />
                  <span className="font-medium">{item.label}</span>
                </div>
              );
            })}
          </nav>

          {/* Portfolios */}
          <div>
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Portfolios
            </p>

            <div
              onClick={() => onSelectAccount('ALL')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] cursor-pointer mb-3 transition-colors ${
                selectedAccount === 'ALL'
                  ? 'bg-sidebar-accent text-sidebar-primary-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <Wallet size={14} />
              All Portfolios
            </div>

            <div className="space-y-3">
              {Object.entries(groupedAccounts).map(([category, categoryAccounts]) => {
                if (categoryAccounts.length === 0) return null;
                const Config = CATEGORY_CONFIG[category];
                const isExpanded = expandedGroups[category];

                return (
                  <div key={category}>
                    <div
                      onClick={() => toggleGroup(category)}
                      className="flex items-center justify-between px-3 py-1.5 cursor-pointer text-muted-foreground hover:text-sidebar-accent-foreground group"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">{Config.label}</span>
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </div>

                    {isExpanded && (
                      <div className="mt-0.5 space-y-0.5 ml-3">
                        {categoryAccounts.map((account) => (
                          <div
                            key={account}
                            onClick={() => onSelectAccount(account)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setContextMenu({ x: e.clientX, y: e.clientY, account });
                            }}
                            className={`group flex items-center justify-between px-3 py-1.5 rounded-md text-[13px] cursor-pointer transition-colors ${
                              selectedAccount === account
                                ? 'text-sidebar-primary-foreground font-medium'
                                : 'text-sidebar-foreground hover:text-sidebar-accent-foreground'
                            }`}
                          >
                            <span className="truncate">{account}</span>
                            <div
                              onClick={(e) => openRenameModal(e, account)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-sidebar-accent rounded text-sidebar-foreground hover:text-primary transition-all"
                            >
                              <Pencil size={10} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border">
          <div
            onClick={onOpenSettings}
            className="flex items-center gap-3 px-3 py-2 text-sidebar-foreground hover:text-sidebar-accent-foreground cursor-pointer hover:bg-sidebar-accent rounded-lg transition-colors"
          >
            <Settings size={16} />
            <span className="text-[13px] font-medium">Settings</span>
          </div>
          <div
            onClick={onLogout}
            className="flex items-center gap-3 px-3 py-2 text-sidebar-foreground hover:text-destructive cursor-pointer hover:bg-destructive/10 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            <span className="text-[13px] font-medium">Logout</span>
          </div>
        </div>
      </aside>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              setDeleteConfirm({ open: true, accountName: contextMenu.account });
              setContextMenu(null);
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 size={14} />
            Delete Account
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => !open && setDeleteConfirm({ open: false, accountName: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm.accountName}</strong>? This will permanently delete the account AND all its associated transactions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onDeleteAccount(deleteConfirm.accountName);
                setDeleteConfirm({ open: false, accountName: '' });
              }}
            >
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
              <button
                onClick={() => setRenameModal({ open: false, oldName: '', newName: '' })}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Portfolio Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="w-full p-2 border border-input rounded-lg focus:ring-2 focus:ring-ring/20 focus:border-ring outline-none bg-background"
                  value={renameModal.newName}
                  onChange={(e) => setRenameModal((prev) => ({ ...prev, newName: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setRenameModal({ open: false, oldName: '', newName: '' })}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!renameModal.newName.trim() || renameModal.newName === renameModal.oldName}
                  className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/85 rounded-lg disabled:opacity-50"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default AppSidebar;
