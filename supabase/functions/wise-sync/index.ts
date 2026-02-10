import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // User-scoped client for auth verification and data operations
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

    // Service role client for reading sensitive connection data
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { wise_connection_id, days_back } = await req.json();
    if (!wise_connection_id) {
      return new Response(
        JSON.stringify({ error: "wise_connection_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the connection using service role (includes api_token)
    const { data: conn, error: connErr } = await supabaseAdmin
      .rpc("get_wise_connection_with_token", { p_connection_id: wise_connection_id })
      .single();

    if (connErr || !conn) {
      return new Response(
        JSON.stringify({ error: "Connection not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Date range
    const intervalEnd = new Date().toISOString();
    const daysBack = days_back || 90;
    const intervalStart = new Date(
      Date.now() - daysBack * 24 * 60 * 60 * 1000
    ).toISOString();

    // Call Wise Balance Statement API
    const wiseUrl = `https://api.transferwise.com/v1/profiles/${conn.profile_id}/balance-statements/${conn.balance_id}/statement.json?intervalStart=${intervalStart}&intervalEnd=${intervalEnd}&type=FLAT`;

    const wiseRes = await fetch(wiseUrl, {
      headers: { Authorization: `Bearer ${conn.api_token}` },
    });

    if (!wiseRes.ok) {
      const errText = await wiseRes.text();
      return new Response(
        JSON.stringify({
          error: `Wise API error [${wiseRes.status}]: ${errText}`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const wiseData = await wiseRes.json();
    const transactions = wiseData.transactions || [];

    if (transactions.length === 0) {
      // Update last_synced_at even if no new txs
      await supabaseAdmin
        .from("wise_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", wise_connection_id);

      return new Response(
        JSON.stringify({ inserted: 0, total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch existing transactions for dedup
    const { data: existingTxs } = await supabaseAdmin
      .from("transactions")
      .select("date, amount, description, currency")
      .eq("account", conn.account_name);

    const existingFingerprints = new Set(
      (existingTxs || []).map(
        (t: any) =>
          `${t.date}-${t.amount}-${(t.description || "").trim().toLowerCase()}-${t.currency}`
      )
    );

    // Map Wise transactions to our model
    const mapped = transactions.map((wt: any) => {
      const isDebit = wt.type === "DEBIT";
      const amount = Math.abs(wt.amount?.value || 0);
      const date = (wt.date || "").split("T")[0];
      const description = wt.details?.description || wt.details?.type || "Wise Transaction";
      const currency = wt.amount?.currency || conn.currency;

      return {
        id: crypto.randomUUID(),
        date,
        amount,
        currency,
        description,
        type: isDebit ? "Outflow" : "Inflow",
        account: conn.account_name,
        category: "Uncategorized",
        notes: wt.referenceNumber ? `Ref: ${wt.referenceNumber}` : null,
        running_balance: wt.runningBalance?.value ?? null,
        _fingerprint: `${date}-${amount}-${description.trim().toLowerCase()}-${currency}`,
      };
    });

    // Deduplicate
    const newTxs = mapped.filter(
      (t: any) => !existingFingerprints.has(t._fingerprint)
    );

    let inserted = 0;
    if (newTxs.length > 0) {
      // Remove _fingerprint before inserting
      const payloads = newTxs.map(({ _fingerprint, ...rest }: any) => rest);

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

    // Update last_synced_at
    await supabaseAdmin
      .from("wise_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", wise_connection_id);

    return new Response(
      JSON.stringify({ inserted, total: transactions.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("wise-sync error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
