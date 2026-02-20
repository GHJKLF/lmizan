import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF",
  "UGX","VND","VUV","XAF","XOF","XPF",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Claim one pending job atomically
    const { data: job, error: claimError } = await adminClient.rpc("claim_next_sync_job");

    if (claimError) {
      throw new Error(`claim_next_sync_job failed: ${claimError.message}`);
    }

    if (!job || !job.id) {
      return new Response(
        JSON.stringify({ status: "idle", message: "No pending jobs" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch connection credentials
    const rpcMap: Record<string, string> = {
      paypal: "get_paypal_connection_with_secret",
      wise: "get_wise_connection_with_token",
      stripe: "get_stripe_connection_with_key",
    };
    const { data: connRows, error: connError } = await adminClient.rpc(rpcMap[job.provider], {
      p_connection_id: job.connection_id,
    });
    if (connError || !connRows || connRows.length === 0) {
      await failJob(adminClient, job, "Connection not found");
      return new Response(
        JSON.stringify({ status: "error", error: "Connection not found", job_id: job.id }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const conn = connRows[0];

    let transactions: any[] = [];
    let nextCursor: string | null = null;

    try {
      if (job.provider === "stripe") {
        ({ transactions, nextCursor } = await fetchStripe(job, conn));
      } else if (job.provider === "paypal") {
        ({ transactions, nextCursor } = await fetchPaypal(job, conn));
      } else if (job.provider === "wise") {
        ({ transactions, nextCursor } = await fetchWise(job, conn));
      }
    } catch (apiErr) {
      // API error: re-queue with exponential backoff
      const attempts = job.attempts;
      if (attempts >= job.max_attempts) {
        await failJob(adminClient, job, apiErr instanceof Error ? apiErr.message : "API error");
      } else {
        const backoffSeconds = Math.pow(2, attempts) * 60;
        await adminClient.from("sync_jobs").update({
          status: "pending",
          started_at: null,
          next_retry_at: new Date(Date.now() + backoffSeconds * 1000).toISOString(),
          error_message: apiErr instanceof Error ? apiErr.message : "API error",
        }).eq("id", job.id);
      }
      if (job.session_id) {
        await adminClient.rpc("update_sync_session_progress", { p_session_id: job.session_id });
      }
      return new Response(
        JSON.stringify({ status: "error", job_id: job.id, error: apiErr instanceof Error ? apiErr.message : "API error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upsert transactions in batches of 500
    const batchSize = 500;
    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      const { error: upsertErr } = await adminClient
        .from("transactions")
        .upsert(batch, { onConflict: "id", ignoreDuplicates: true });
      if (upsertErr) {
        console.error("Upsert error:", upsertErr.message);
      }
    }

    // Update job status
    if (nextCursor) {
      await adminClient.from("sync_jobs").update({
        status: "pending",
        started_at: null,
        cursor: nextCursor,
        records_processed: (job.records_processed || 0) + transactions.length,
      }).eq("id", job.id);
    } else {
      await adminClient.from("sync_jobs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        records_processed: (job.records_processed || 0) + transactions.length,
      }).eq("id", job.id);
    }

    // Update session progress
    if (job.session_id) {
      await adminClient.rpc("update_sync_session_progress", { p_session_id: job.session_id });
    }

    return new Response(
      JSON.stringify({
        status: "processed",
        job_id: job.id,
        provider: job.provider,
        records_inserted: transactions.length,
        has_more: !!nextCursor,
        next_cursor: nextCursor,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("process-sync-chunk error:", err);
    return new Response(
      JSON.stringify({ status: "error", error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function failJob(client: any, job: any, message: string) {
  await client.from("sync_jobs").update({
    status: "failed",
    error_message: message,
    completed_at: new Date().toISOString(),
  }).eq("id", job.id);
  if (job.session_id) {
    await client.rpc("update_sync_session_progress", { p_session_id: job.session_id });
  }
}

// ─── STRIPE ────────────────────────────────────────────────────────────────────

async function fetchStripe(job: any, conn: any) {
  const params = new URLSearchParams({
    limit: "100",
    "created[gte]": String(Math.floor(new Date(job.chunk_start).getTime() / 1000)),
    "created[lte]": String(Math.floor(new Date(job.chunk_end).getTime() / 1000)),
  });
  if (job.cursor) params.set("starting_after", job.cursor);

  const res = await fetch(`https://api.stripe.com/v1/balance_transactions?${params}`, {
    headers: { Authorization: "Basic " + btoa(conn.api_key + ":") },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Stripe API ${res.status}: ${body}`);
  }
  const data = await res.json();

  const transactions = (data.data || []).map((item: any) => {
    const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(item.currency?.toUpperCase());
    const netAmount = isZeroDecimal ? item.net : item.net / 100;
    return {
      id: "stripe-" + item.id,
      user_id: conn.user_id,
      account: conn.account_name,
      date: new Date(item.created * 1000).toISOString().split("T")[0],
      description: item.description || item.type,
      amount: Math.abs(netAmount),
      currency: item.currency?.toUpperCase(),
      type: item.type === "payout" ? "Transfer" : (/reserve/i.test(item.description || item.type || "") ? "Transfer" : (netAmount >= 0 ? "Inflow" : "Outflow")),
      provider: "stripe",
      provider_transaction_id: item.id,
      notes: "stripe_bt:" + item.id,
    };
  });

  const nextCursor = data.has_more && data.data.length > 0
    ? data.data[data.data.length - 1].id
    : null;

  return { transactions, nextCursor };
}

// ─── PAYPAL ────────────────────────────────────────────────────────────────────

async function fetchPaypal(job: any, conn: any) {
  const baseUrl = conn.environment === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

  // Get OAuth token
  const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(conn.client_id + ":" + conn.client_secret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`PayPal OAuth ${tokenRes.status}: ${body}`);
  }
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  const page = job.cursor ? parseInt(job.cursor) : 1;
  const params = new URLSearchParams({
    start_date: job.chunk_start,
    end_date: job.chunk_end,
    page_size: "100",
    fields: "all",
    page: String(page),
  });

  const txRes = await fetch(`${baseUrl}/v1/reporting/transactions?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  if (!txRes.ok) {
    const body = await txRes.text();
    // Detect RESULTSET_TOO_LARGE: split job in half and re-queue
    if (txRes.status === 400 && body.includes("RESULTSET_TOO_LARGE")) {
      const startMs = new Date(job.chunk_start).getTime();
      const endMs = new Date(job.chunk_end).getTime();
      const diffMs = endMs - startMs;

      if (diffMs <= 24 * 60 * 60 * 1000) {
        throw new Error(`RESULTSET_TOO_LARGE even for a 1-day chunk (${job.chunk_start} to ${job.chunk_end})`);
      }

      const midMs = startMs + Math.floor(diffMs / 2);
      const mid = new Date(midMs).toISOString();
      console.log(`PayPal RESULTSET_TOO_LARGE: splitting job ${job.id} at ${mid}`);

      // Shrink current job to first half (will be re-processed)
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await adminClient.from("sync_jobs").update({
        chunk_end: mid,
        status: "pending",
        started_at: null,
        cursor: null,
      }).eq("id", job.id);

      // Create new job for second half
      await adminClient.from("sync_jobs").insert({
        user_id: job.user_id,
        connection_id: job.connection_id,
        provider: job.provider,
        job_type: job.job_type,
        chunk_start: mid,
        chunk_end: job.chunk_end,
        session_id: job.session_id,
        priority: job.priority,
        status: "pending",
      });

      // Update session to reflect the new chunk count
      if (job.session_id) {
        await adminClient.rpc("update_sync_session_progress", { p_session_id: job.session_id });
      }

      // Return empty so the caller marks no records and the job re-queues
      return { transactions: [], nextCursor: null };
    }
    throw new Error(`PayPal Transactions API ${txRes.status}: ${body}`);
  }
  const txData = await txRes.json();

  const items = txData.transaction_details || [];
  const transactions = items.map((detail: any) => {
    const t = detail.transaction_info || {};
    const amountValue = parseFloat(t.transaction_amount?.value || "0");
    return {
      id: "paypal-" + t.transaction_id,
      user_id: conn.user_id,
      account: conn.account_name,
      date: t.transaction_initiation_date?.split("T")[0],
      description: t.transaction_subject || t.transaction_note || t.transaction_event_code,
      amount: Math.abs(amountValue),
      currency: t.transaction_amount?.currency_code || conn.currency,
      type: amountValue >= 0 ? "Inflow" : "Outflow",
      provider: "paypal",
      provider_transaction_id: t.transaction_id,
      notes: "paypal_id:" + t.transaction_id,
    };
  });

  const totalPages = txData.total_pages || 1;
  const nextCursor = page < totalPages ? String(page + 1) : null;

  return { transactions, nextCursor };
}

// ─── WISE ──────────────────────────────────────────────────────────────────────

async function fetchWise(job: any, conn: any) {
  const params = new URLSearchParams({
    currency: conn.currency,
    intervalStart: job.chunk_start,
    intervalEnd: job.chunk_end,
  });

  const res = await fetch(
    `https://api.wise.com/v3/profiles/${conn.profile_id}/borderless-accounts/${conn.balance_id}/statement.json?${params}`,
    { headers: { Authorization: `Bearer ${conn.api_token}` } }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Wise API ${res.status}: ${body}`);
  }
  const data = await res.json();

  const transactions = (data.transactions || []).map((t: any) => {
    const amountValue = t.amount?.value || 0;
    return {
      id: "wise-" + t.referenceNumber,
      user_id: conn.user_id,
      account: conn.account_name,
      date: t.date?.split("T")[0],
      description: t.details?.description || t.type,
      amount: Math.abs(amountValue),
      currency: t.amount?.currency || conn.currency,
      type: (t.details?.description || "").toLowerCase().includes("stripe payments") ? "Transfer" : (amountValue >= 0 ? "Inflow" : "Outflow"),
      provider: "wise",
      provider_transaction_id: t.referenceNumber,
      notes: "wise_ref:" + t.referenceNumber,
    };
  });

  return { transactions, nextCursor: null };
}
