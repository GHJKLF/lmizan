import React, { useState, useEffect } from 'react';
import { ACCOUNTS } from '@/constants';
import { DataService } from '@/services/dataService';
import { toast } from 'sonner';
import { X, Settings, Save, ArrowRight } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const PROCESSORS = ACCOUNTS.filter((a) => {
  const n = a.toLowerCase();
  return n.includes('stripe') || n.includes('paypal') || n.includes('payoneer') || n.includes('airwallex') || n.includes('worldfirst');
});

const BANK_ACCOUNTS = ACCOUNTS.filter((a) => {
  const n = a.toLowerCase();
  return n.includes('wise') || n.includes('cih') || n.includes('cfg') || n.includes('bank');
});

const SettingsModal: React.FC<Props> = ({ open, onClose }) => {
  const [mappings, setMappings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setMappings(DataService.getAccountMappings());
    }
  }, [open]);

  if (!open) return null;

  const updateMapping = (processor: string, bankAccount: string) => {
    setMappings((prev) => {
      const next = { ...prev };
      if (bankAccount) next[processor] = bankAccount;
      else delete next[processor];
      return next;
    });
  };

  const handleSave = () => {
    DataService.saveAccountMappings(mappings);
    toast.success('Payout routing saved');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card rounded-xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings size={20} className="text-primary" />
            <h2 className="font-bold text-foreground">Payout Routing</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure where each processor sends payouts. This is used for payout reconciliation.
          </p>

          <div className="space-y-3">
            {PROCESSORS.map((processor) => (
              <div key={processor} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium text-foreground min-w-[120px]">{processor}</span>
                <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                <select
                  value={mappings[processor] || ''}
                  onChange={(e) => updateMapping(processor, e.target.value)}
                  className="flex-1 px-2 py-1.5 text-sm border border-input rounded-lg bg-background"
                >
                  <option value="">Not configured</option>
                  {BANK_ACCOUNTS.map((bank) => (
                    <option key={bank} value={bank}>{bank}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary rounded-lg hover:opacity-90 flex items-center gap-1.5"
          >
            <Save size={14} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
