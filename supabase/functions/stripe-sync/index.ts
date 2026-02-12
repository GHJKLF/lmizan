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

function mapType(txType: string, net: number): string {
  return net >= 0 ? "Inflow" : "Outflow";
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

    const { connection_id } = await req.json();
    if (!connection_id) {
      return new Response(
        JSON.stringify({ error: "connection_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: conn, error: connErr } = await supabaseAdmin
      .rpc("get_stripe_connection_with_key", { p_connection_id: connection_id })
      .single();

    if (connErr || !conn) {
      return new Response(
        JSON.stringify({ error: "Connection not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeHeaders = {
      Authorization: `Bearer ${conn.api_key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    // Fetch existing dedup keys upfront
    // Paginate to load ALL existing dedup keys (PostgREST caps single queries)
    const existingIds = new Set<string>();
    let dedupOffset = 0;
    const DEDUP_PAGE = 1000;
    while (true) {
      const { data: batch } = await supabaseAdmin
        .from("transactions")
        .select("notes")
        .eq("account", conn.account_name)
        .eq("user_id", conn.user_id)
        .range(dedupOffset, dedupOffset + DEDUP_PAGE - 1)
        .order("id", { ascending: true });
      if (!batch || batch.length === 0) break;
      batch.forEach((t: any) => {
        const match = (t.notes || "").match(/stripe_bt:([^\s|]+)/);
        if (match) existingIds.add(match[1]);
      });
      dedupOffset += batch.length;
      if (batch.length < DEDUP_PAGE) break;
    }

    // Helper: map a Stripe balance_transaction to our insert format
    function mapBt(bt: any) {
      const currency = (bt.currency || "usd").toUpperCase();
      const netAmount = fromStripeAmount(bt.net || 0, currency);
      const grossAmount = fromStripeAmount(bt.amount || 0, currency);
      const feeAmount = fromStripeAmount(bt.fee || 0, currency);
      const type = mapType(bt.type || "", netAmount);
      const amount = Math.abs(netAmount);
      const date = new Date((bt.created || 0) * 1000).toISOString().split("T")[0];
      const description = bt.description || bt.type || "Stripe Transaction";
      const feePart = feeAmount !== 0 ? ` | Fee: -${feeAmount.toFixed(2)} ${currency}` : "";
      const grossPart = grossAmount !== netAmount ? ` | Gross: ${grossAmount.toFixed(2)} ${currency}` : "";
      return {
        id: crypto.randomUUID(),
        date,
        amount,
        currency,
        description,
        type,
        account: conn.account_name,
        category: "Uncategorized",
        notes: `stripe_bt:${bt.id}${feePart}${grossPart}`,
        running_balance: null,
        user_id: conn.user_id,
        _stripe_id: bt.id,
      };
    }

    // Helper: dedup, filter, insert a page of Stripe balance_transactions
    async function insertPage(pageTxs: any[]): Promise<number> {
      const filtered = pageTxs;
      const mapped = filtered.map(mapBt);
      const newTxs = mapped.filter((t: any) => t._stripe_id && !existingIds.has(t._stripe_id));
      let inserted = 0;
      if (newTxs.length > 0) {
        const payloads = newTxs.map(({ _stripe_id, ...rest }: any) => rest);
        const CHUNK = 500;
        for (let i = 0; i < payloads.length; i += CHUNK) {
          const chunk = payloads.slice(i, i + CHUNK);
          const { error: insertErr } = await supabaseAdmin
            .from("transactions")
            .insert(chunk);
          if (!insertErr) {
            inserted += chunk.length;
            chunk.forEach((t: any) => {
              const match = (t.notes || "").match(/stripe_bt:([^\s|]+)/);
              if (match) existingIds.add(match[1]);
            });
          } else {
            console.error("Insert error:", insertErr);
          }
        }
      }
      return inserted;
    }

    // ── PHASE 1: Forward sync (new transactions) ──
    const lastSyncedAt = conn.last_synced_at;
    let startingAfter: string | null = null;
    let hasMore = true;
    let totalFetched = 0;
    let totalInserted = 0;
    let isFirstPage = true;
    

    while (hasMore) {
      let url = "https://api.stripe.com/v1/balance_transactions?limit=100";
      if (lastSyncedAt) {
        const gte = Math.floor(new Date(lastSyncedAt).getTime() / 1000);
        url += `&created[gte]=${gte}`;
      }
      if (startingAfter) url += `&starting_after=${startingAfter}`;

      const res = await fetch(url, { headers: stripeHeaders });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Stripe API error [${res.status}]: ${errText}`);
      }

      const data = await res.json();
      const pageTxs: any[] = data.data || [];
      hasMore = data.has_more || false;

      if (pageTxs.length === 0) { hasMore = false; break; }
      startingAfter = pageTxs[pageTxs.length - 1].id;
      totalFetched += pageTxs.length;

      const pageInserted = await insertPage(pageTxs);
      totalInserted += pageInserted;

      // CHANGE 1: Only update last_synced_at on the FIRST page (newest timestamp)
      if (isFirstPage) {
        const newestCreated = pageTxs[0]?.created;
        if (newestCreated) {
          const syncTs = new Date(newestCreated * 1000).toISOString();
          await supabaseAdmin
            .from("stripe_connections")
            .update({ last_synced_at: syncTs })
            .eq("id", connection_id);
        }
        isFirstPage = false;
      }

    }

    // If no transactions were fetched at all, still update last_synced_at
    if (totalFetched === 0 && isFirstPage) {
      await supabaseAdmin
        .from("stripe_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", connection_id);
    }

    // ── PHASE 2: Backfill (older transactions) ──
    let totalBackfilled = 0;

    // Find the oldest transaction date we have for this account
    const { data: oldestRow } = await supabaseAdmin
      .from("transactions")
      .select("date")
      .eq("account", conn.account_name)
      .eq("user_id", conn.user_id)
      .order("date", { ascending: true })
      .limit(1);

    if (oldestRow && oldestRow.length > 0 && oldestRow[0].date) {
      const oldestDate = oldestRow[0].date;
      const ltTimestamp = Math.floor(new Date(oldestDate).getTime() / 1000);
      let backfillStartingAfter: string | null = null;
      let backfillHasMore = true;

      while (backfillHasMore) {
        let url = `https://api.stripe.com/v1/balance_transactions?limit=100&created[lt]=${ltTimestamp}`;
        if (backfillStartingAfter) url += `&starting_after=${backfillStartingAfter}`;

        const res = await fetch(url, { headers: stripeHeaders });
        if (!res.ok) {
          const errText = await res.text();
          console.error(`Stripe backfill API error [${res.status}]: ${errText}`);
          break;
        }

        const data = await res.json();
        const pageTxs: any[] = data.data || [];
        backfillHasMore = data.has_more || false;

        if (pageTxs.length === 0) break;
        backfillStartingAfter = pageTxs[pageTxs.length - 1].id;
        totalFetched += pageTxs.length;

        const pageInserted = await insertPage(pageTxs);
        totalBackfilled += pageInserted;
        totalInserted += pageInserted;
      }
    }

    return new Response(
      JSON.stringify({ synced: totalInserted, total_fetched: totalFetched, backfilled: totalBackfilled }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("stripe-sync error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
