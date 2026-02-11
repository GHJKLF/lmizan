import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF","CLP","DJF","GNF","ISK","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF",
]);

function fromStripeAmount(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? amount : amount / 100;
}

function mapType(txType: string, net: number): string {
  const inflowTypes = new Set(["charge", "payment", "payment_refund_reversal", "transfer", "payout_cancel"]);
  const outflowTypes = new Set(["payout", "refund", "stripe_fee", "dispute", "payment_failure_refund", "payout_failure"]);

  if (inflowTypes.has(txType)) return "Inflow";
  if (outflowTypes.has(txType)) return "Outflow";
  // For adjustment, application_fee, etc. — use sign
  return net >= 0 ? "Inflow" : "Outflow";
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
      .rpc("get_stripe_connection_with_key", { p_connection_id: connection_id })
      .single();

    if (connErr || !conn) {
      return new Response(
        JSON.stringify({ error: "Connection not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeHeaders = {
      Authorization: `Bearer ${conn.api_key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    // Paginate through all balance transactions
    const allTxs: any[] = [];
    let startingAfter: string | null = null;
    let hasMore = true;

    while (hasMore) {
      let url = "https://api.stripe.com/v1/balance_transactions?limit=100";
      if (startingAfter) url += `&starting_after=${startingAfter}`;

      const res = await fetch(url, { headers: stripeHeaders });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Stripe API error [${res.status}]: ${errText}`);
      }

      const data = await res.json();
      allTxs.push(...(data.data || []));
      hasMore = data.has_more || false;
      if (data.data?.length > 0) {
        startingAfter = data.data[data.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    if (allTxs.length === 0) {
      await supabaseAdmin
        .from("stripe_connections")
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
          const match = (t.notes || "").match(/stripe_bt:([^\s|]+)/);
          return match ? match[1] : null;
        })
        .filter(Boolean)
    );

    // Map transactions
    const mapped = allTxs.map((bt: any) => {
      const currency = (bt.currency || "usd").toUpperCase();
      const netAmount = fromStripeAmount(bt.net || 0, currency);
      const grossAmount = fromStripeAmount(bt.amount || 0, currency);
      const feeAmount = fromStripeAmount(bt.fee || 0, currency);
      const type = mapType(bt.type || "", netAmount);
      const amount = Math.abs(netAmount);
      const date = new Date((bt.created || 0) * 1000).toISOString().split("T")[0];
      const description = bt.description || bt.type || "Stripe Transaction";

      const feePart = feeAmount !== 0 ? ` | Fee: -${feeAmount.toFixed(2)} ${currency}` : "";
      const grossPart = grossAmount !== netAmount ? ` | Gross: ${grossAmount.toFixed(2)} ${currency}` : "";

      return {
        id: crypto.randomUUID(),
        date,
        amount,
        currency,
        description,
        type,
        account: conn.account_name,
        category: "Uncategorized",
        notes: `stripe_bt:${bt.id}${feePart}${grossPart}`,
        running_balance: null,
        user_id: conn.user_id,
        _stripe_id: bt.id,
      };
    });

    const newTxs = mapped.filter((t: any) => t._stripe_id && !existingIds.has(t._stripe_id));

    let inserted = 0;
    if (newTxs.length > 0) {
      const payloads = newTxs.map(({ _stripe_id, ...rest }: any) => rest);
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
      .from("stripe_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", connection_id);

    return new Response(
      JSON.stringify({ synced: inserted, total_fetched: allTxs.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("stripe-sync error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
