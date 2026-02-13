import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate: only allow service-role or anon key (from pg_cron)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (token !== serviceRoleKey && token !== anonKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    const results: any[] = [];

    // Fetch all connections
    const { data: paypalConns } = await supabaseAdmin
      .from("paypal_connections")
      .select("id, account_name");

    const { data: wiseConns } = await supabaseAdmin
      .from("wise_connections")
      .select("id, account_name");

    const { data: stripeConns } = await supabaseAdmin
      .from("stripe_connections")
      .select("id, account_name");

    // Helper to call a sync function
    async function callSync(
      functionName: string,
      connectionId: string,
      accountName: string,
      provider: string
    ) {
      try {
        const res = await fetch(
          `${baseUrl}/functions/v1/${functionName}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              connection_id: connectionId,
              full_sync: false,
            }),
          }
        );
        const body = await res.json().catch(() => ({}));
        const result = {
          provider,
          account: accountName,
          connection_id: connectionId,
          status: res.ok ? "ok" : "error",
          code: res.status,
          ...body,
        };
        console.log(`sync-scheduler: ${provider}/${accountName} => ${res.status}`, body);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`sync-scheduler: ${provider}/${accountName} failed:`, errorMsg);
        return {
          provider,
          account: accountName,
          connection_id: connectionId,
          status: "error",
          error: errorMsg,
        };
      }
    }

    // Sync all PayPal connections
    for (const conn of paypalConns || []) {
      results.push(await callSync("paypal-sync", conn.id, conn.account_name, "paypal"));
    }

    // Sync all Wise connections
    for (const conn of wiseConns || []) {
      results.push(await callSync("wise-sync", conn.id, conn.account_name, "wise"));
    }

    // Sync all Stripe connections
    for (const conn of stripeConns || []) {
      results.push(await callSync("stripe-sync", conn.id, conn.account_name, "stripe"));
    }

    const summary = {
      total: results.length,
      ok: results.filter((r) => r.status === "ok").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    };

    console.log(`sync-scheduler complete: ${summary.ok}/${summary.total} succeeded`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-scheduler error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
