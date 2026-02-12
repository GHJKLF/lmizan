import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getPayPalToken(clientId: string, clientSecret: string, env: string): Promise<string> {
  const base = env === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`PayPal OAuth error [${res.status}]: ${errText}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function fetchTransactionPage(
  base: string,
  token: string,
  startDate: string,
  endDate: string,
  page: number
): Promise<{ transactions: any[]; totalPages: number }> {
  const url = `${base}/v1/reporting/transactions?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&fields=all&page_size=500&page=${page}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`PayPal Transactions API error [${res.status}]: ${errText}`);
  }
  const data = await res.json();
  return {
    transactions: data.transaction_details || [],
    totalPages: data.total_pages || 1,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { connection_id } = await req.json();
    if (!connection_id) {
      return new Response(
        JSON.stringify({ error: "connection_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: conn, error: connErr } = await supabaseAdmin
      .rpc("get_paypal_connection_with_secret", { p_connection_id: connection_id })
      .single();

    if (connErr || !conn) {
      return new Response(
        JSON.stringify({ error: "Connection not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const env = conn.environment || "live";
    const base = env === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
    const token = await getPayPalToken(conn.client_id, conn.client_secret, env);

    const now = new Date();
    const intervalEnd = now.toISOString();
    const safeStart = new Date(Date.now() - (2 * 365 + 335) * 24 * 60 * 60 * 1000);
    const intervalStart = conn.last_synced_at
      ? new Date(conn.last_synced_at).toISOString()
      : safeStart.toISOString();

    // Build 7-day chunks to stay under PayPal's 10,000 item limit
    const chunks: { start: string; end: string }[] = [];
    let chunkStart = new Date(intervalStart);
    const endDate = new Date(intervalEnd);
    while (chunkStart < endDate) {
      const chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() + 7);
      if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());
      chunks.push({ start: chunkStart.toISOString(), end: chunkEnd.toISOString() });
      chunkStart = new Date(chunkEnd);
    }

    // Fetch all transactions across chunks
    const allTxDetails: any[] = [];
    for (const chunk of chunks) {
      let page = 1;
      while (true) {
        const result = await fetchTransactionPage(base, token, chunk.start, chunk.end, page);
        allTxDetails.push(...result.transactions);
        if (page >= result.totalPages) break;
        page++;
      }
    }

    if (allTxDetails.length === 0) {
      await supabaseAdmin
        .from("paypal_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", connection_id);
      return new Response(
        JSON.stringify({ synced: 0, total_fetched: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch existing dedup keys
    const { data: existingTxs } = await supabaseAdmin
      .from("transactions")
      .select("notes")
      .eq("account", conn.account_name)
      .eq("user_id", conn.user_id);

    const existingIds = new Set(
      (existingTxs || [])
        .map((t: any) => {
          const match = (t.notes || "").match(/paypal_tx:([^\s]+)/);
          return match ? match[1] : null;
        })
        .filter(Boolean)
    );

    // Map and filter transactions
    const mapped = allTxDetails
      .map((td: any) => {
        const info = td.transaction_info || {};
        const payer = td.payer_info || {};
        const txId = info.transaction_id || "";
        const grossAmount = parseFloat(info.transaction_amount?.value || "0");
        const feeAmount = parseFloat(info.fee_amount?.value || "0");
        const netAmount = grossAmount + feeAmount; // fee is negative
        const type = netAmount >= 0 ? "Inflow" : "Outflow";
        const amount = Math.abs(netAmount);
        const date = (info.transaction_initiation_date || "").split("T")[0];
        const description =
          info.transaction_subject ||
          info.transaction_note ||
          payer.payer_name?.alternate_full_name ||
          "PayPal Transaction";
        const currency = info.transaction_amount?.currency_code || conn.currency || "USD";
        const feeNote = feeAmount !== 0 ? ` | Fee: ${feeAmount} ${currency}` : "";

        return {
          id: crypto.randomUUID(),
          date,
          amount,
          currency,
          description,
          type,
          account: conn.account_name,
          category: "Uncategorized",
          notes: `paypal_tx:${txId}${feeNote}`,
          running_balance: null,
          user_id: conn.user_id,
          _paypal_id: txId,
        };
      });

    const newTxs = mapped.filter((t: any) => t._paypal_id && !existingIds.has(t._paypal_id));

    let inserted = 0;
    if (newTxs.length > 0) {
      const payloads = newTxs.map(({ _paypal_id, ...rest }: any) => rest);
      const CHUNK = 500;
      for (let i = 0; i < payloads.length; i += CHUNK) {
        const chunk = payloads.slice(i, i + CHUNK);
        const { error: insertErr } = await supabaseAdmin
          .from("transactions")
          .insert(chunk);
        if (!insertErr) inserted += chunk.length;
        else console.error("Insert error:", insertErr);
      }
    }

    await supabaseAdmin
      .from("paypal_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", connection_id);

    return new Response(
      JSON.stringify({ synced: inserted, total_fetched: allTxDetails.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("paypal-sync error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
