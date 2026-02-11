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

    const { api_key } = await req.json();
    if (!api_key) {
      return new Response(
        JSON.stringify({ error: "api_key is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeHeaders = {
      Authorization: `Bearer ${api_key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    // Fetch account info and balance in parallel
    const [accountRes, balanceRes] = await Promise.all([
      fetch("https://api.stripe.com/v1/account", { headers: stripeHeaders }),
      fetch("https://api.stripe.com/v1/balance", { headers: stripeHeaders }),
    ]);

    if (!accountRes.ok) {
      const errText = await accountRes.text();
      if (accountRes.status === 401) throw new Error("Invalid Stripe API key");
      throw new Error(`Stripe Account API error [${accountRes.status}]: ${errText}`);
    }

    if (!balanceRes.ok) {
      const errText = await balanceRes.text();
      throw new Error(`Stripe Balance API error [${balanceRes.status}]: ${errText}`);
    }

    const account = await accountRes.json();
    const balance = await balanceRes.json();

    // Build per-currency balances
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
      JSON.stringify({
        account_id: account.id,
        email: account.email || "",
        currencies: Object.keys(currencyMap),
        balances,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("stripe-discover error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("Invalid Stripe API key") ? 401 : 500;
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
