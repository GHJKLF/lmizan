import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signature-sha256",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Read raw body for signature verification
    const bodyText = await req.text();
    let body: any;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventType = body.event_type || body.event;

    if (
      eventType !== "balances#update" &&
      eventType !== "balances#credit"
    ) {
      return new Response(JSON.stringify({ status: "ignored", event: eventType }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = body.data || {};
    const balanceId = String(data.balance_id || "");

    if (!balanceId) {
      return new Response(JSON.stringify({ error: "No balance_id in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conn, error: connErr } = await supabase
      .from("wise_connections")
      .select("*")
      .eq("balance_id", balanceId)
      .limit(1)
      .single();

    if (connErr || !conn) {
      console.error("No connection found for balance_id:", balanceId);
      return new Response(
        JSON.stringify({ error: "No connection for this balance_id" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate webhook signature with HMAC-SHA256
    if (conn.webhook_secret) {
      const signature = req.headers.get("x-signature-sha256");
      if (!signature) {
        return new Response(JSON.stringify({ error: "Missing signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(conn.webhook_secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signatureBytes = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(bodyText)
      );
      const computedSignature = Array.from(new Uint8Array(signatureBytes))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (computedSignature !== signature) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Build transaction
    const amount = Math.abs(data.amount || 0);
    const isCredit =
      data.transaction_type === "CREDIT" || eventType === "balances#credit";
    const date = new Date().toISOString().split("T")[0];
    const description =
      data.transfer_reference ||
      data.channel_name ||
      `Wise ${isCredit ? "Credit" : "Debit"}`;

    const tx = {
      id: crypto.randomUUID(),
      date,
      amount,
      currency: data.currency || conn.currency,
      description,
      type: isCredit ? "Inflow" : "Outflow",
      account: conn.account_name,
      category: "Uncategorized",
      running_balance: data.post_transaction_balance_amount ?? null,
      notes: data.transfer_reference ? `Ref: ${data.transfer_reference}` : null,
    };

    const { error: insertErr } = await supabase
      .from("transactions")
      .insert(tx);

    if (insertErr) {
      console.error("Webhook insert error:", insertErr);
      return new Response(
        JSON.stringify({ error: "Failed to insert transaction" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ status: "ok", transaction_id: tx.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("wise-webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
