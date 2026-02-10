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

    const { api_token, label, public_key_pem } = await req.json();
    if (!api_token || !public_key_pem) {
      return new Response(
        JSON.stringify({ error: "api_token and public_key_pem are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const keyLabel = label || "Lovable Auto-Generated Key";
    const body = JSON.stringify({ label: keyLabel, publicKey: public_key_pem });
    const headers = {
      Authorization: `Bearer ${api_token}`,
      "Content-Type": "application/json",
    };

    // Try v1 first
    let res = await fetch("https://api.wise.com/v1/me/public-keys", {
      method: "POST",
      headers,
      body,
    });

    // If 404, try v2
    if (res.status === 404) {
      res = await fetch("https://api.wise.com/v2/me/public-keys", {
        method: "POST",
        headers,
        body,
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Wise public-key upload failed [${res.status}]:`, errText);
      return new Response(
        JSON.stringify({ success: false, error: `Wise API error [${res.status}]: ${errText}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    return new Response(
      JSON.stringify({ success: true, keyId: data.id || data.keyId || null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("wise-upload-key error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
