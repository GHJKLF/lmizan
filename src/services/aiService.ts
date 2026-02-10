import { Transaction } from '@/types';
import { toEUR } from '@/services/balanceEngine';

/**
 * Create a minified transaction context string for AI consumption.
 * Sends the most recent N transactions as a compact CSV-like format.
 */
export const buildTransactionContext = (transactions: Transaction[], limit = 200): string => {
  const sorted = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);

  if (sorted.length === 0) return "No transactions available.";

  const header = "date|description|category|amount|currency|eur|account|type";
  const rows = sorted.map((t) => {
    const eur = Math.round(toEUR(t.amount, t.currency));
    return `${t.date}|${t.description}|${t.category}|${t.amount}|${t.currency}|${eur}|${t.account}|${t.type}`;
  });

  return `${sorted.length} transactions (most recent ${limit}):\n${header}\n${rows.join("\n")}`;
};

/**
 * Build outflow-only context for the cash flow audit.
 */
export const buildOutflowContext = (transactions: Transaction[]): string => {
  const outflows = transactions.filter((t) => t.type === 'Outflow');
  return buildTransactionContext(outflows, 500);
};

/**
 * Stream SSE response from an edge function, calling onDelta for each token.
 */
export const streamAIResponse = async ({
  url,
  body,
  onDelta,
  onDone,
  onError,
}: {
  url: string;
  body: Record<string, unknown>;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) => {
  try {
    // Get session token for authenticated requests
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token;
    if (!authToken) {
      onError("Not authenticated. Please log in.");
      return;
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({ error: "Request failed" }));
      onError(errorData.error || `Error ${resp.status}`);
      return;
    }

    if (!resp.body) {
      onError("No response body");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") { streamDone = true; break; }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    // Flush remaining
    if (buffer.trim()) {
      for (let raw of buffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch { /* ignore */ }
      }
    }

    onDone();
  } catch (e) {
    onError(e instanceof Error ? e.message : "Unknown error");
  }
};
