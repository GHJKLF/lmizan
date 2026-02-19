import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function toBase64(str: string): string {
  // Use TextEncoder for reliable base64 encoding (handles special chars in secrets)
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function getPayPalToken(clientId: string, clientSecret: string, env: string = "live"): Promise<string> {
  const base = env === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  const credentials = `${clientId}:${clientSecret}`;
  const encoded = toBase64(credentials);
  
  console.log(`PayPal OAuth: env=${env}, base=${base}, clientId length=${clientId.length}, secret length=${clientSecret.length}`);
  
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`PayPal OAuth failed [${res.status}]: ${errText}`);
    if (res.status === 401) throw new Error(`Invalid PayPal credentials. Verify your Client ID and Secret are for the ${env} environment. PayPal response: ${errText}`);
    throw new Error(`PayPal OAuth error [${res.status}]: ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
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

    const { client_id, client_secret, environment } = await req.json();
    if (!client_id || !client_secret) {
      return new Response(
        JSON.stringify({ error: "client_id and client_secret are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const env = environment || "live";
    const base = env === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
    const token = await getPayPalToken(client_id, client_secret, env);

    // Get account email
    let email = "";
    try {
      const userInfoRes = await fetch(`${base}/v1/identity/openidconnect/userinfo?schema=openid`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json();
        email = userInfo.email || "";
      }
    } catch {
      // Email fetch is optional
    }

    // Get balances
    const now = new Date().toISOString();
    const balancesRes = await fetch(
      `${base}/v1/reporting/balances?as_of_time=${encodeURIComponent(now)}&currency_code=ALL`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    let balances: any[] = [];
    if (balancesRes.ok) {
      const balancesData = await balancesRes.json();
      balances = (balancesData.balances || []).map((b: any) => ({
        currency: b.currency,
        primary: b.primary || false,
        available: parseFloat(b.available_balance?.value || "0"),
        withheld: parseFloat(b.withheld_balance?.value || "0"),
        total: parseFloat(b.total_balance?.value || "0"),
      }));
    }

    return new Response(
      JSON.stringify({ email, balances }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("paypal-discover error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("Invalid PayPal credentials") ? 401 : 500;
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
