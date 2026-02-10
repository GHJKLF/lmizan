import React, { useState, useRef } from 'react';
import { Transaction, Currency, TransactionType } from '@/types';
import { DataService, generateFingerprint } from '@/services/dataService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Upload,
  Loader2,
  AlertCircle,
  FileText,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';

interface Props {
  transactions: Transaction[];
  accounts: string[];
  onImportComplete: () => Promise<void>;
  open: boolean;
  onClose: () => void;
}

const IMPORT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-import`;

const ImportModal: React.FC<Props> = ({ transactions, accounts, onImportComplete, open, onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [accountHint, setAccountHint] = useState(accounts[0] || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Transaction[] | null>(null);
  const [duplicateFlags, setDuplicateFlags] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const readFileContent = async (f: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      if (f.type.startsWith('image/')) {
        reader.readAsDataURL(f);
      } else {
        reader.readAsText(f);
      }
    });
  };

  const processFile = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    setPreview(null);

    try {
      const content = await readFileContent(file);

      const resp = await fetch(IMPORT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          fileContent: content,
          fileName: file.name,
          accountHint,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: 'Processing failed' }));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      const data = await resp.json();
      const parsed: Transaction[] = (data.transactions || []).map((t: any) => ({
        id: crypto.randomUUID(),
        date: t.date,
        description: t.description || '',
        category: t.category || 'Other',
        amount: Math.abs(Number(t.amount) || 0),
        currency: (t.currency as Currency) || Currency.EUR,
        account: t.account || accountHint,
        type: (t.type as TransactionType) || TransactionType.OUTFLOW,
        runningBalance: t.runningBalance ?? undefined,
        balanceAvailable: t.balanceAvailable ?? undefined,
        balanceReserved: t.balanceReserved ?? undefined,
      }));

      // Duplicate detection
      const existingFingerprints = new Set(transactions.map(generateFingerprint));
      const dupes = new Set<number>();
      parsed.forEach((t, i) => {
        if (existingFingerprints.has(generateFingerprint(t))) dupes.add(i);
      });

      setPreview(parsed);
      setDuplicateFlags(dupes);
    } catch (e: any) {
      setError(e.message || 'Failed to process file');
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setIsProcessing(true);

    // Filter out flagged duplicates
    const toImport = preview.filter((_, i) => !duplicateFlags.has(i));

    try {
      const result = await DataService.addTransactionsBulk(toImport);
      toast.success(`Imported ${result.added} transactions (${result.skipped} skipped)`);
      await onImportComplete();
      resetAndClose();
    } catch {
      toast.error('Import failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetAndClose = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setDuplicateFlags(new Set());
    onClose();
  };

  const nonDupeCount = preview ? preview.length - duplicateFlags.size : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card rounded-xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Upload size={20} className="text-primary" />
            <h2 className="font-bold text-foreground">AI Document Import</h2>
          </div>
          <button onClick={resetAndClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* File upload */}
          {!preview && (
            <>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Target Account</label>
                <select
                  value={accountHint}
                  onChange={(e) => setAccountHint(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background"
                >
                  {accounts.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt,.pdf,image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <FileText size={32} className="mx-auto mb-3 text-muted-foreground/50" />
                {file ? (
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-muted-foreground">Drop a file or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">CSV, PDF, or image bank statements</p>
                  </>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <button
                onClick={processFile}
                disabled={!file || isProcessing}
                className="w-full py-2.5 bg-primary text-primary-foreground font-bold rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {isProcessing ? 'AI is processing...' : 'Analyze with AI'}
              </button>
            </>
          )}

          {/* Preview */}
          {preview && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  {preview.length} transactions extracted · {duplicateFlags.size} duplicates flagged
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPreview(null); setFile(null); }}
                    className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                  >
                    Back
                  </button>
                  <button
                    onClick={confirmImport}
                    disabled={isProcessing || nonDupeCount === 0}
                    className="px-4 py-1.5 text-xs font-bold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Import {nonDupeCount}
                  </button>
                </div>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Status</th>
                        <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Date</th>
                        <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Description</th>
                        <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Category</th>
                        <th className="px-2 py-2 text-right font-semibold text-muted-foreground">Amount</th>
                        <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.map((tx, i) => {
                        const isDupe = duplicateFlags.has(i);
                        return (
                          <tr key={i} className={isDupe ? 'bg-destructive/5 opacity-60' : ''}>
                            <td className="px-2 py-1.5">
                              {isDupe ? (
                                <span className="flex items-center gap-1 text-destructive">
                                  <AlertTriangle size={12} /> Dupe
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-emerald-600">
                                  <Check size={12} /> New
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{tx.date}</td>
                            <td className="px-2 py-1.5 max-w-[200px] truncate" title={tx.description}>{tx.description}</td>
                            <td className="px-2 py-1.5">{tx.category}</td>
                            <td className="px-2 py-1.5 text-right whitespace-nowrap">
                              {tx.amount.toFixed(2)} {tx.currency}
                            </td>
                            <td className="px-2 py-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${tx.type === 'Inflow' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'}`}>
                                {tx.type}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
