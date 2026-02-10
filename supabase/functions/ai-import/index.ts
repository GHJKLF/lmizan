import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !data?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { fileContent, fileName, accountHint } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a financial document parser for the IMIZAN finance system.

## Your Task
Extract transactions from the provided bank statement / CSV / financial document.

## Output Format
Return ONLY a valid JSON array of transaction objects. No markdown, no explanation, just the JSON array.

Each transaction object must have:
{
  "date": "YYYY-MM-DD",
  "description": "string",
  "category": "one of: Sales, Inventory, Marketing, Software, Logistics, Operations, Salary, Assets, Transfer, Reserves, Tax, Other",
  "amount": number (positive, absolute value),
  "currency": "EUR|USD|MAD|GBP|ILS|DKK|SEK",
  "type": "Inflow|Outflow",
  "account": "string (detected or use accountHint)",
  "runningBalance": number or null,
  "balanceAvailable": number or null,
  "balanceReserved": number or null
}

## Classification Rules
- Stripe: "Sales" for charges, "Transfer" for payouts
- PayPal: "Sales" for received payments, category by description for sent
- Bank transfers between own accounts: "Transfer"
- SaaS/software charges: "Software"
- Ad spend (Meta, Google, TikTok): "Marketing"
- Shipping/logistics: "Logistics"
- Wages/contractor: "Salary"

## Important
- Parse dates to YYYY-MM-DD format regardless of input format
- Use absolute values for amounts (always positive)
- Determine Inflow/Outflow from context (credits vs debits, +/-)
- If account is unclear, use the accountHint: "${accountHint || 'Unknown'}"
- Extract running balances if present in the statement
- Handle multi-currency statements`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Parse this financial document (filename: ${fileName}):\n\n${fileContent}` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI import error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data2 = await response.json();
    const content = data2.choices?.[0]?.message?.content || "[]";
    
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let transactions;
    try {
      transactions = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response as JSON:", jsonStr.substring(0, 500));
      return new Response(JSON.stringify({ error: "AI returned invalid format. Please try again.", raw: jsonStr.substring(0, 200) }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ transactions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-import error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
