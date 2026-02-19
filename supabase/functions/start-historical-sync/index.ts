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
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { connection_id, provider } = await req.json();
    if (!connection_id || !provider || !["paypal", "wise", "stripe"].includes(provider)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid connection_id or provider" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify connection exists using security definer functions
    const rpcMap: Record<string, string> = {
      paypal: "get_paypal_connection_with_secret",
      wise: "get_wise_connection_with_token",
      stripe: "get_stripe_connection_with_key",
    };
    const { data: connData, error: connError } = await supabase.rpc(rpcMap[provider], {
      p_connection_id: connection_id,
    });
    if (connError || !connData || connData.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Connection not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine earliest sync start
    const now = new Date();
    let startDate: Date;
    if (provider === "paypal") {
      startDate = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
    } else {
      // wise & stripe: 5 years
      startDate = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
    }

    // Generate monthly chunks
    const chunks: { chunk_start: string; chunk_end: string }[] = [];
    const cursor = new Date(startDate);
    while (cursor < now) {
      const chunkStart = new Date(cursor);
      cursor.setMonth(cursor.getMonth() + 1);
      const chunkEnd = cursor < now ? new Date(cursor) : new Date(now);
      chunks.push({
        chunk_start: chunkStart.toISOString(),
        chunk_end: chunkEnd.toISOString(),
      });
    }

    // Use service role for inserts into sync tables
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Create sync session
    const { data: session, error: sessionError } = await adminClient
      .from("sync_sessions")
      .insert({
        user_id: user.id,
        connection_id,
        provider,
        sync_type: "historical",
        status: "running",
        total_chunks: chunks.length,
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      throw new Error(`Failed to create session: ${sessionError?.message}`);
    }

    // Bulk insert all chunk jobs
    const jobs = chunks.map((chunk, index) => ({
      user_id: user.id,
      provider,
      connection_id,
      job_type: "historical",
      status: "pending",
      chunk_start: chunk.chunk_start,
      chunk_end: chunk.chunk_end,
      priority: index,
      session_id: session.id,
    }));

    const { error: jobsError } = await adminClient.from("sync_jobs").insert(jobs);
    if (jobsError) {
      throw new Error(`Failed to insert jobs: ${jobsError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        session_id: session.id,
        chunks_queued: chunks.length,
        provider,
        message: "Historical sync queued. Processing will begin automatically.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("start-historical-sync error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
