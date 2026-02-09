import React from 'react';
import { Transaction } from '@/types';
import AIChatAssistant from './AIChatAssistant';
import CashFlowAudit from './CashFlowAudit';

interface Props {
  transactions: Transaction[];
}

const AIInsightsView: React.FC<Props> = ({ transactions }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">AI Analyst</h2>
        <p className="text-sm text-muted-foreground">Chat with your data and run forensic audits</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <AIChatAssistant transactions={transactions} />
        <CashFlowAudit transactions={transactions} />
      </div>
    </div>
  );
};

export default AIInsightsView;
