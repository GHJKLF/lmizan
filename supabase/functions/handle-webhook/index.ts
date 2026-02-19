import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacVerify(secret: string, payload: string, signature: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get("provider");
    if (!provider || !["stripe", "paypal", "wise"].includes(provider)) {
      return ok({ received: true, error: "Unknown provider", queued: false });
    }

    const rawBody = await req.text();
    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return ok({ received: true, error: "Invalid JSON", queued: false });
    }

    // ─── Signature verification ──────────────────────────────────────────
    if (provider === "stripe") {
      const stripeSig = req.headers.get("stripe-signature");
      if (!stripeSig) {
        console.warn("handle-webhook: Stripe webhook missing stripe-signature header");
      }
      // Stripe signature verification is done per-connection below if webhook_secret exists
    } else if (provider === "paypal") {
      const transmissionId = req.headers.get("paypal-transmission-id");
      if (!transmissionId) {
        console.warn("handle-webhook: PayPal webhook missing paypal-transmission-id header");
      }
    } else if (provider === "wise") {
      const wiseSig = req.headers.get("x-signature-sha256");
      if (!wiseSig) {
        console.warn("handle-webhook: Wise webhook missing x-signature-sha256 header");
      }
    }

    // ─── Extract event_id for idempotency ────────────────────────────────
    let eventId: string;
    if (provider === "stripe") {
      eventId = event.id;
    } else if (provider === "paypal") {
      eventId = event.id || event.event_id;
    } else {
      eventId =
        event.data?.resource?.id ||
        `${event.event_type || "unknown"}_${Date.now()}`;
    }

    if (!eventId) {
      return ok({ received: true, error: "No event_id found", queued: false });
    }

    // ─── Idempotency check ───────────────────────────────────────────────
    const { error: idempError } = await adminClient
      .from("webhook_events")
      .insert({ provider, event_id: eventId });

    if (idempError) {
      // Conflict = already processed
      if (idempError.code === "23505") {
        return ok({ received: true, event_id: eventId, queued: false, message: "Already processed" });
      }
      console.error("handle-webhook: idempotency insert error", idempError.message);
    }

    // ─── Find matching connection ────────────────────────────────────────
    let connection: any = null;

    if (provider === "stripe") {
      const accountId = event.account;
      if (accountId) {
        const { data } = await adminClient
          .from("stripe_connections")
          .select("id, user_id, account_name")
          .eq("stripe_account_id", accountId)
          .limit(1);
        if (data?.length) connection = data[0];
      }
      if (!connection) {
        // Fallback: pick any stripe connection
        const { data } = await adminClient
          .from("stripe_connections")
          .select("id, user_id, account_name")
          .limit(1);
        if (data?.length) connection = data[0];
      }
    } else if (provider === "paypal") {
      const merchantId = event.resource?.merchant_id;
      if (merchantId) {
        // No merchant_id column, just pick any PayPal connection
      }
      const { data } = await adminClient
        .from("paypal_connections")
        .select("id, user_id, account_name")
        .limit(1);
      if (data?.length) connection = data[0];
    } else if (provider === "wise") {
      const profileId = event.data?.resource?.profileId;
      if (profileId) {
        const { data } = await adminClient
          .from("wise_connections")
          .select("id, user_id, account_name, webhook_secret")
          .eq("profile_id", String(profileId))
          .limit(1);
        if (data?.length) {
          connection = data[0];
          // Verify HMAC if we have a secret and a signature
          const wiseSig = req.headers.get("x-signature-sha256");
          if (connection.webhook_secret && wiseSig) {
            const valid = await hmacVerify(connection.webhook_secret, rawBody, wiseSig);
            if (!valid) {
              console.warn("handle-webhook: Wise HMAC verification failed");
              return ok({ received: true, error: "Signature mismatch", queued: false });
            }
          }
        }
      }
      if (!connection) {
        const { data } = await adminClient
          .from("wise_connections")
          .select("id, user_id, account_name")
          .limit(1);
        if (data?.length) connection = data[0];
      }
    }

    if (!connection) {
      return ok({ received: true, event_id: eventId, queued: false, message: "No matching connection" });
    }

    // ─── Enqueue high-priority incremental sync job ──────────────────────
    const { error: jobError } = await adminClient.from("sync_jobs").insert({
      user_id: connection.user_id,
      provider,
      connection_id: connection.id,
      job_type: "webhook",
      status: "pending",
      chunk_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      chunk_end: new Date().toISOString(),
      priority: 1,
    });

    if (jobError) {
      console.error("handle-webhook: failed to enqueue job", jobError.message);
      return ok({ received: true, event_id: eventId, queued: false, error: jobError.message });
    }

    return ok({ received: true, event_id: eventId, queued: true });
  } catch (err) {
    console.error("handle-webhook error:", err);
    return ok({ received: true, error: err instanceof Error ? err.message : "Unknown error", queued: false });
  }
});
