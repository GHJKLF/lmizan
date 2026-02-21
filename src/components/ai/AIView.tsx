import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Transaction } from '@/types';
import { buildTransactionContext, buildOutflowContext, streamAIResponse } from '@/services/aiService';
import { Send, Loader2, Bot, User, AlertCircle, FileText, Search } from 'lucide-react';

interface Props {
  transactions: Transaction[];
}

type Message = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
const AUDIT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-audit`;

const AIView: React.FC<Props> = ({ transactions }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditReport, setAuditReport] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    setError(null);
    const userMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    let assistantSoFar = '';
    const allMessages = [...messages, userMsg];
    const txContext = buildTransactionContext(transactions);

    await streamAIResponse({
      url: CHAT_URL,
      body: { messages: allMessages, transactionContext: txContext },
      onDelta: (chunk) => {
        assistantSoFar += chunk;
        const snapshot = assistantSoFar;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: snapshot } : m));
          return [...prev, { role: 'assistant', content: snapshot }];
        });
      },
      onDone: () => setIsLoading(false),
      onError: (err) => { setError(err); setIsLoading(false); },
    });
  };

  const runAudit = async () => {
    setAuditReport('');
    setAuditLoading(true);
    let reportSoFar = '';
    await streamAIResponse({
      url: AUDIT_URL,
      body: { transactionContext: buildOutflowContext(transactions) },
      onDelta: (chunk) => { reportSoFar += chunk; setAuditReport(reportSoFar); },
      onDone: () => setAuditLoading(false),
      onError: (err) => { setError(err); setAuditLoading(false); },
    });
  };

  const outflowCount = transactions.filter((t) => t.type === 'Outflow').length;

  return (
    <div className="flex gap-6 h-[calc(100vh-140px)]">
      {/* Left panel — insights */}
      <div className="w-[300px] shrink-0 bg-card border border-border rounded-2xl flex flex-col overflow-hidden shadow-[0_2px_8px_rgba(11,20,55,0.06)]">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[hsl(var(--color-red)/0.1)]">
              <Search size={16} className="text-[hsl(var(--color-red))]" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Where's My Money?</p>
              <p className="text-xs text-muted-foreground">{outflowCount} outflows</p>
            </div>
          </div>
        </div>
        <div className="p-4">
          <button onClick={runAudit} disabled={auditLoading || outflowCount === 0} className="w-full py-2 bg-primary text-primary-foreground font-bold text-xs rounded-lg hover:bg-primary/85 disabled:opacity-50 flex items-center justify-center gap-1.5">
            {auditLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            {auditLoading ? 'Analyzing...' : 'Run Audit'}
          </button>
        </div>
        {auditReport && (
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="prose prose-sm max-w-none text-foreground [&_table]:text-xs [&_th]:px-2 [&_td]:px-2">
              <ReactMarkdown>{auditReport}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {/* Right panel — chat */}
      <div className="flex-1 bg-card border border-border rounded-2xl flex flex-col overflow-hidden shadow-[0_2px_8px_rgba(11,20,55,0.06)]">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10"><Bot size={16} className="text-primary" /></div>
          <div>
            <p className="text-sm font-bold text-foreground">AI Financial Analyst</p>
            <p className="text-xs text-muted-foreground">Ask questions about your financial data</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Bot size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Ask me anything about your finances</p>
              <p className="text-xs mt-1">e.g. "What are my top expenses?" or "Compare revenue by account"</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-1"><Bot size={14} className="text-primary" /></div>}
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'rounded-2xl rounded-br-md px-4 py-2.5' : ''}`} style={msg.role === 'user' ? { background: 'hsl(var(--color-navy))', color: 'white' } : {}}>
                {msg.role === 'user' ? <p className="text-sm">{msg.content}</p> : (
                  <div className="prose prose-sm max-w-none text-foreground [&_table]:text-xs [&_th]:px-2 [&_td]:px-2"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                )}
              </div>
              {msg.role === 'user' && <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center mt-1"><User size={14} className="text-muted-foreground" /></div>}
            </div>
          ))}
          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex gap-3"><div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center"><Loader2 size={14} className="text-primary animate-spin" /></div><p className="text-sm text-muted-foreground animate-pulse">Analyzing...</p></div>
          )}
          {error && <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive text-sm rounded-lg"><AlertCircle size={16} />{error}</div>}
          <div ref={bottomRef} />
        </div>

        <div className="p-3 border-t border-border">
          <div className="flex gap-2">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask about your finances..." rows={1} className="flex-1 resize-none px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
            <button onClick={send} disabled={!input.trim() || isLoading} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIView;
