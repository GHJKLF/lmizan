import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchAllTransfers(
  profileId: string,
  token: string,
  intervalStart: string,
  intervalEnd: string
): Promise<any[]> {
  const all: any[] = [];
  const limit = 50;
  const maxPages = 4;

  for (let page = 0; page < maxPages; page++) {
    const offset = page * limit;
    const url = `https://api.transferwise.com/v1/transfers?profile=${profileId}&limit=${limit}&offset=${offset}&createdDateStart=${encodeURIComponent(intervalStart)}&createdDateEnd=${encodeURIComponent(intervalEnd)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Wise API error [${res.status}]: ${errText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < limit) break;
  }

  return all;
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

    const { wise_connection_id } = await req.json();
    if (!wise_connection_id) {
      return new Response(
        JSON.stringify({ error: "wise_connection_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: conn, error: connErr } = await supabaseAdmin
      .rpc("get_wise_connection_with_token", { p_connection_id: wise_connection_id })
      .single();

    if (connErr || !conn) {
      return new Response(
        JSON.stringify({ error: "Connection not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Date range: use last_synced_at or default to 12 months ago
    const intervalEnd = new Date().toISOString();
    const intervalStart = conn.last_synced_at
      ? new Date(conn.last_synced_at).toISOString()
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    const transfers = await fetchAllTransfers(
      conn.profile_id,
      conn.api_token,
      intervalStart,
      intervalEnd
    );

    if (transfers.length === 0) {
      await supabaseAdmin
        .from("wise_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", wise_connection_id);

      return new Response(
        JSON.stringify({ inserted: 0, total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch existing fingerprints for dedup (using transfer.id stored in notes or description)
    const { data: existingTxs } = await supabaseAdmin
      .from("transactions")
      .select("notes")
      .eq("account", conn.account_name)
      .eq("user_id", conn.user_id);

    const existingIds = new Set(
      (existingTxs || [])
        .map((t: any) => {
          const match = (t.notes || "").match(/^wise_transfer_id:(\d+)/);
          return match ? match[1] : null;
        })
        .filter(Boolean)
    );

    const mapped = transfers.map((tr: any) => {
      const amount = Math.abs(tr.sourceValue || 0);
      const date = (tr.created || "").split("T")[0];
      const recipientName = tr.targetAccount?.name?.fullName || tr.targetAccount?.name || "";
      const reference = tr.details?.reference || "";
      const descParts = [recipientName, reference].filter(Boolean);
      const description = descParts.length > 0 ? descParts.join(" – ") : "Wise Transfer";

      return {
        id: crypto.randomUUID(),
        date,
        amount,
        currency: tr.sourceCurrency || conn.currency,
        description,
        type: "Outflow",
        account: conn.account_name,
        category: "Uncategorized",
        notes: `wise_transfer_id:${tr.id}`,
        running_balance: null,
        user_id: conn.user_id,
        _wise_id: String(tr.id),
      };
    });

    const newTxs = mapped.filter((t: any) => !existingIds.has(t._wise_id));

    let inserted = 0;
    if (newTxs.length > 0) {
      const payloads = newTxs.map(({ _wise_id, ...rest }: any) => rest);
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
      .from("wise_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", wise_connection_id);

    return new Response(
      JSON.stringify({ inserted, total: transfers.length }),
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
