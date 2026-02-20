import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AIRWALLEX_BASE = "https://api.airwallex.com";

function mapType(txType: string, rawAmount: number): "Inflow" | "Outflow" | "Transfer" {
  const t = (txType || "").toUpperCase();
  if (t === "DEPOSIT") return "Inflow";
  if (t === "PAYMENT" || t === "FEE") return "Outflow";
  if (t === "TRANSFER" || t === "FX_CONVERSION" || t.includes("CONVERSION") || t === "PAYOUT") return "Transfer";
  // Unknown: infer from amount sign
  return rawAmount >= 0 ? "Inflow" : "Outflow";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate user via anon client
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

    const { connection_id, full_sync } = await req.json();
    if (!connection_id) {
      return new Response(JSON.stringify({ error: "connection_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch credentials securely via SECURITY DEFINER RPC
    const { data: connRows, error: connErr } = await supabaseAdmin.rpc(
      "get_airwallex_connection_with_key",
      { p_connection_id: connection_id }
    );
    if (connErr || !connRows?.length) {
      return new Response(JSON.stringify({ error: "Connection not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const conn = connRows[0];

    // STEP 1: Get fresh Bearer token (stateless — new token per invocation)
    const authRes = await fetch(`${AIRWALLEX_BASE}/api/v1/authentication/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": conn.client_id,
        "x-api-key": conn.api_key,
      },
    });
    if (!authRes.ok) {
      throw new Error(`Airwallex auth failed: ${await authRes.text()}`);
    }
    const { token } = await authRes.json();
    const awxHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // STEP 2: Determine date range
    const defaultDaysBack = full_sync ? 730 : 90;
    const fromDate = conn.last_synced_at
      ? new Date(conn.last_synced_at).toISOString()
      : conn.sync_start_date
        ? new Date(conn.sync_start_date).toISOString()
        : new Date(Date.now() - defaultDaysBack * 24 * 60 * 60 * 1000).toISOString();

    // STEP 3: Paginate /api/v1/financial_transactions
    let pageNum = 0;
    const pageSize = 100;
    let hasMore = true;
    let totalInserted = 0;
    let newestDate: string | null = null;

    while (hasMore) {
      const params = new URLSearchParams({
        from_created_at: fromDate,
        to_created_at: new Date().toISOString(),
        page_num: String(pageNum),
        page_size: String(pageSize),
      });

      const txRes = await fetch(`${AIRWALLEX_BASE}/api/v1/financial_transactions?${params}`, {
        headers: awxHeaders,
      });
      if (!txRes.ok) {
        throw new Error(`Airwallex transactions failed [${txRes.status}]: ${await txRes.text()}`);
      }
      const txData = await txRes.json();

      const items: any[] = txData.items || txData.data || [];
      hasMore = txData.has_more === true || items.length === pageSize;
      if (items.length === 0) break;

      if (pageNum === 0 && items[0]?.created_at) newestDate = items[0].created_at;

      const mapped = items.map((t: any) => {
        const rawAmount = Number(t.amount || t.debit_amount || t.credit_amount || 0);
        const amount = Math.abs(rawAmount);
        const currency = (t.currency || conn.currency || "EUR").toUpperCase();
        const txType = (t.transaction_type || t.type || "").toUpperCase();
        const type = mapType(txType, rawAmount);

        return {
          id: "airwallex-" + t.id,
          date: (t.created_at || t.transaction_date || new Date().toISOString()).split("T")[0],
          amount,
          currency,
          description: t.short_reference || t.description || t.transaction_type || "Airwallex Transaction",
          type,
          account: conn.account_name,
          category: "Uncategorized",
          notes: `awx_ref:${t.id}`,
          running_balance: null,
          user_id: conn.user_id,
        };
      });

      if (mapped.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < mapped.length; i += CHUNK) {
          const { error: upsertErr } = await supabaseAdmin
            .from("transactions")
            .upsert(mapped.slice(i, i + CHUNK), { onConflict: "id", ignoreDuplicates: true });
          if (!upsertErr) totalInserted += mapped.slice(i, i + CHUNK).length;
          else console.error("Upsert error:", upsertErr);
        }
      }
      pageNum++;
    }

    // STEP 4: Update last_synced_at
    await supabaseAdmin
      .from("airwallex_connections")
      .update({ last_synced_at: newestDate || new Date().toISOString() })
      .eq("id", connection_id);

    // STEP 5: Fetch live balances
    try {
      const balRes = await fetch(`${AIRWALLEX_BASE}/api/v1/balances/current`, {
        headers: awxHeaders,
      });
      if (balRes.ok) {
        const balData = await balRes.json();
        const balances: any[] = Array.isArray(balData) ? balData : balData.items || [];
        const match = balances.find(
          (b: any) => (b.currency || "").toUpperCase() === conn.currency.toUpperCase()
        );
        if (match) {
          await supabaseAdmin
            .from("airwallex_connections")
            .update({
              balance_available: Number(match.available_amount || match.total_amount || 0),
              balance_fetched_at: new Date().toISOString(),
            })
            .eq("id", connection_id);
        }
      }
    } catch (balErr) {
      console.error("Balance fetch error:", balErr);
    }

    return new Response(JSON.stringify({ synced: totalInserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("airwallex-sync error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
