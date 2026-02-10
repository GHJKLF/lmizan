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

    const { api_token } = await req.json();
    if (!api_token || typeof api_token !== "string" || api_token.length < 10) {
      return new Response(
        JSON.stringify({ error: "A valid api_token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch profiles
    const profilesRes = await fetch("https://api.wise.com/v2/profiles", {
      headers: { Authorization: `Bearer ${api_token}` },
    });
    if (!profilesRes.ok) {
      const errText = await profilesRes.text();
      throw new Error(`Wise profiles API error [${profilesRes.status}]: ${errText}`);
    }
    const profiles: any[] = await profilesRes.json();

    // Get already-connected balance_ids for this user
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: existingConns } = await supabaseAdmin
      .from("wise_connections")
      .select("balance_id")
      .eq("user_id", user.id);
    const connectedBalanceIds = new Set(
      (existingConns || []).map((c: any) => String(c.balance_id))
    );

    // For each profile, fetch balances
    const result = await Promise.all(
      profiles.map(async (p: any) => {
        const balRes = await fetch(
          `https://api.wise.com/v4/profiles/${p.id}/balances?types=STANDARD`,
          { headers: { Authorization: `Bearer ${api_token}` } }
        );
        let balances: any[] = [];
        if (balRes.ok) {
          balances = await balRes.json();
        }
        const fullName = p.type === "PERSONAL"
          ? (`${p.details?.firstName || ""} ${p.details?.lastName || ""}`.trim() || `Profile ${p.id}`)
          : (p.details?.companyName || p.details?.tradingName || p.details?.name || `Profile ${p.id}`);
        return {
          id: p.id,
          fullName,
          type: p.type,
          balances: (balances || []).map((b: any) => ({
            id: b.id,
            currency: b.currency,
            amount: { value: b.amount?.value ?? 0, currency: b.currency },
            isConnected: connectedBalanceIds.has(String(b.id)),
          })),
        };
      })
    );

    return new Response(JSON.stringify({ profiles: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("wise-discover error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
