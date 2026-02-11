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

    const balanceRes = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${conn.api_key}` },
    });

    if (!balanceRes.ok) {
      const errText = await balanceRes.text();
      throw new Error(`Stripe Balance API error [${balanceRes.status}]: ${errText}`);
    }

    const balance = await balanceRes.json();

    const currencyMap: Record<string, { available: number; pending: number }> = {};

    for (const b of balance.available || []) {
      const cur = (b.currency || "").toUpperCase();
      if (!currencyMap[cur]) currencyMap[cur] = { available: 0, pending: 0 };
      currencyMap[cur].available += fromStripeAmount(b.amount, cur);
    }

    for (const b of balance.pending || []) {
      const cur = (b.currency || "").toUpperCase();
      if (!currencyMap[cur]) currencyMap[cur] = { available: 0, pending: 0 };
      currencyMap[cur].pending += fromStripeAmount(b.amount, cur);
    }

    const balances = Object.entries(currencyMap).map(([currency, vals]) => ({
      currency,
      available: vals.available,
      pending: vals.pending,
      total: vals.available + vals.pending,
    }));

    return new Response(
      JSON.stringify({ balances }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("stripe-balances error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
