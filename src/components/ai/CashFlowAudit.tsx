import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Transaction } from '@/types';
import { buildOutflowContext, streamAIResponse } from '@/services/aiService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Loader2, AlertCircle, FileText } from 'lucide-react';

interface Props {
  transactions: Transaction[];
}

const AUDIT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-audit`;

const CashFlowAudit: React.FC<Props> = ({ transactions }) => {
  const [report, setReport] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAudit = async () => {
    setReport('');
    setError(null);
    setIsLoading(true);

    const txContext = buildOutflowContext(transactions);
    let reportSoFar = '';

    await streamAIResponse({
      url: AUDIT_URL,
      body: { transactionContext: txContext },
      onDelta: (chunk) => {
        reportSoFar += chunk;
        setReport(reportSoFar);
      },
      onDone: () => setIsLoading(false),
      onError: (err) => {
        setError(err);
        setIsLoading(false);
      },
    });
  };

  const outflowCount = transactions.filter((t) => t.type === 'Outflow').length;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-destructive/10">
              <Search size={18} className="text-destructive" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold">Where's My Money?</CardTitle>
              <p className="text-xs text-muted-foreground">Forensic cash flow audit · {outflowCount} outflows</p>
            </div>
          </div>
          <button
            onClick={runAudit}
            disabled={isLoading || outflowCount === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-primary-foreground bg-primary hover:opacity-90 rounded-lg disabled:opacity-50 transition-opacity"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            {isLoading ? 'Analyzing...' : 'Run Audit'}
          </button>
        </div>
      </CardHeader>

      {error && (
        <div className="mx-4 mb-3 flex items-center gap-2 p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {report && (
        <CardContent className="pt-0">
          <div className="prose prose-sm max-w-none text-foreground border-t border-border pt-4 [&_table]:text-xs [&_th]:px-2 [&_td]:px-2 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm">
            <ReactMarkdown>{report}</ReactMarkdown>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default CashFlowAudit;
