import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchBalanceStatements(
  profileId: string,
  balanceId: string,
  currency: string,
  token: string,
  privateKeyPem: string,
  intervalStart: string,
  intervalEnd: string
): Promise<any[]> {
  const url = `https://api.wise.com/v1/profiles/${profileId}/balance-statements/${balanceId}/statement.json?currency=${currency}&intervalStart=${encodeURIComponent(intervalStart)}&intervalEnd=${encodeURIComponent(intervalEnd)}&type=COMPACT`;

  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 403) {
    const ott = res.headers.get("x-2fa-approval");
    if (ott) {
      const pemBody = privateKeyPem
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace(/\s/g, "");
      const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

      const cryptoKey = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        new TextEncoder().encode(ott)
      );
      const signatureBase64 = btoa(
        String.fromCharCode(...new Uint8Array(signature))
      );

      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-2fa-approval": ott,
          "X-Signature": signatureBase64,
        },
      });
    }
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Balance Statements API error [${res.status}]: ${errText}`);
  }

  const data = await res.json();
  return data.transactions || [];
}

async function fetchAllTransfers(
  profileId: string,
  token: string,
  intervalStart: string,
  intervalEnd: string
): Promise<any[]> {
  const all: any[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
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
    offset += limit;
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

    const { wise_connection_id, full_sync } = await req.json();
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

    const intervalEnd = new Date().toISOString();
    const intervalStart = full_sync
      ? "2020-01-01T00:00:00.000Z"
      : conn.last_synced_at
        ? new Date(conn.last_synced_at).toISOString()
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    let newTxs: any[];

    if (conn.private_key && conn.balance_id) {
      console.log("Using Balance Statements API with SCA for connection", wise_connection_id);
      const statements = await fetchBalanceStatements(
        conn.profile_id,
        conn.balance_id,
        conn.currency,
        conn.api_token,
        conn.private_key,
        intervalStart,
        intervalEnd
      );

      if (statements.length === 0) {
        await supabaseAdmin
          .from("wise_connections")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", wise_connection_id);
        return new Response(
          JSON.stringify({ inserted: 0, total: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: existingTxs } = await supabaseAdmin
        .from("transactions")
        .select("notes")
        .eq("account", conn.account_name)
        .eq("user_id", conn.user_id);

      const existingRefs = new Set(
        (existingTxs || [])
          .map((t: any) => {
            const match = (t.notes || "").match(/wise_ref:(.+)/);
            return match ? match[1] : null;
          })
          .filter(Boolean)
      );

      const mapped = statements.map((st: any) => {
        const amount = Math.abs(st.amount?.value || 0);
        const date = (st.date || "").split("T")[0];
        const description = st.details?.description || st.details?.type || "Wise Transaction";
        const isStripeTransfer = description.toLowerCase().includes("stripe payments");
        const type = isStripeTransfer ? "Transfer" : (st.type === "CREDIT" ? "Inflow" : "Outflow");
        const refNumber = st.referenceNumber || "";

        return {
          id: crypto.randomUUID(),
          date,
          amount,
          currency: st.amount?.currency || conn.currency,
          description,
          type,
          account: conn.account_name,
          category: "Uncategorized",
          notes: `wise_ref:${refNumber}`,
          running_balance: st.runningBalance?.value ?? null,
          user_id: conn.user_id,
          _wise_ref: refNumber,
        };
      });

      newTxs = mapped.filter((t: any) => !existingRefs.has(t._wise_ref));
    } else {
      console.log("Using Transfers API fallback for connection", wise_connection_id);
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

      const { data: existingTxs } = await supabaseAdmin
        .from("transactions")
        .select("notes")
        .eq("account", conn.account_name)
        .eq("user_id", conn.user_id);

      const existingIds = new Set(
        (existingTxs || [])
          .map((t: any) => {
            const match = (t.notes || "").match(/wise_transfer_id:(\d+)/);
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

      newTxs = mapped.filter((t: any) => !existingIds.has(t._wise_id));
    }

    let inserted = 0;
    if (newTxs.length > 0) {
      const payloads = newTxs.map(({ _wise_id, _wise_ref, ...rest }: any) => rest);
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
      JSON.stringify({ inserted, total: newTxs.length }),
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
