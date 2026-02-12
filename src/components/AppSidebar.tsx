import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Receipt,
  MessageSquareText,
  Wallet,
  Settings,
  LogOut,
  Building2,
  CreditCard,
  Bitcoin,
  Home,
  ChevronDown,
  ChevronRight,
  PieChart,
  Pencil,
  X,
  Trash2,
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

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; label: string; colorClass: string }> = {
  Banking: { icon: Building2, label: 'Banking', colorClass: 'text-emerald-600' },
  Processors: { icon: CreditCard, label: 'Processors', colorClass: 'text-blue-600' },
  Crypto: { icon: Bitcoin, label: 'Crypto', colorClass: 'text-orange-500' },
  Assets: { icon: Home, label: 'Fixed Assets', colorClass: 'text-purple-600' },
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
    Banking: true,
    Processors: true,
    Crypto: true,
    Assets: true,
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

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  const navItemClass = (isActive: boolean) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer font-medium text-sm ${
      isActive
        ? 'bg-primary text-primary-foreground shadow-lg'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    }`;

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
      <aside className="w-72 bg-card border-r border-border h-screen flex flex-col fixed left-0 top-0 z-20 overflow-y-auto">
        {/* Header */}
        <div className="p-6 pb-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
              <PieChart size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Imizan</h1>
              <p className="text-xs font-medium text-muted-foreground">Finance OS</p>
            </div>
          </div>
        </div>

        <div className="flex-1 px-4 pb-4 space-y-6">
          {/* Main Navigation */}
          <nav className="space-y-1">
            <div onClick={() => onNavigate('DASHBOARD')} className={navItemClass(currentView === 'DASHBOARD')}>
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </div>
            <div onClick={() => onNavigate('TRANSACTIONS')} className={navItemClass(currentView === 'TRANSACTIONS')}>
              <Receipt size={18} />
              <span>Transactions</span>
            </div>
            <div onClick={() => onNavigate('AI_INSIGHTS')} className={navItemClass(currentView === 'AI_INSIGHTS')}>
              <MessageSquareText size={18} />
              <span>AI Analyst</span>
            </div>
          </nav>

          {/* Accounts Section */}
          <div>
            <div className="flex items-center justify-between px-2 mb-3">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Portfolios</span>
            </div>

            <div
              onClick={() => onSelectAccount('ALL')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer mb-4 transition-colors ${
                selectedAccount === 'ALL'
                  ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-100'
                  : 'text-muted-foreground hover:bg-accent border border-transparent'
              }`}
            >
              <div className="p-1.5 bg-card rounded-md shadow-sm border border-border">
                <Wallet size={14} className="text-muted-foreground" />
              </div>
              All Portfolios
            </div>

            <div className="space-y-4 pb-10">
              {Object.entries(groupedAccounts).map(([category, categoryAccounts]) => {
                if (categoryAccounts.length === 0) return null;
                const Config = CATEGORY_CONFIG[category];
                const isExpanded = expandedGroups[category];

                return (
                  <div key={category}>
                    <div
                      onClick={() => toggleGroup(category)}
                      className="flex items-center justify-between px-2 py-1.5 cursor-pointer text-muted-foreground hover:text-foreground group"
                    >
                      <div className="flex items-center gap-2">
                        <Config.icon size={14} className={Config.colorClass} />
                        <span className="text-xs font-semibold">{Config.label}</span>
                      </div>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </div>

                    {isExpanded && (
                      <div className="mt-1 space-y-0.5 ml-2 border-l border-border pl-2">
                        {categoryAccounts.map((account) => (
                          <div
                            key={account}
                            onClick={() => onSelectAccount(account)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setContextMenu({ x: e.clientX, y: e.clientY, account });
                            }}
                            className={`group flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer transition-all ${
                              selectedAccount === account
                                ? 'bg-accent text-foreground font-medium translate-x-1'
                                : 'text-muted-foreground hover:text-foreground hover:translate-x-1'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <div
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  selectedAccount === account ? 'bg-blue-500' : 'bg-muted-foreground/30'
                                }`}
                              />
                              <span className="truncate">{account}</span>
                            </div>
                            <div
                              onClick={(e) => openRenameModal(e, account)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-card rounded text-muted-foreground hover:text-blue-600 transition-all"
                            >
                              <Pencil size={12} />
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
        <div className="p-4 border-t border-border bg-muted/50">
          <div
            onClick={onOpenSettings}
            className="flex items-center gap-3 px-4 py-2 text-muted-foreground hover:text-foreground cursor-pointer hover:bg-card rounded-lg transition-colors"
          >
            <Settings size={18} />
            <span className="text-sm font-medium">Settings</span>
          </div>
          <div
            onClick={onLogout}
            className="flex items-center gap-3 px-4 py-2 text-muted-foreground hover:text-destructive cursor-pointer hover:bg-destructive/10 rounded-lg transition-colors"
          >
            <LogOut size={18} />
            <span className="text-sm font-medium">Logout</span>
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
                  className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none"
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
