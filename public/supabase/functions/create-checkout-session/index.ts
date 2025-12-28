import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14?target=deno&no-check";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
  apiVersion: "2023-10-16",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // CORSプリフライト対応
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // リクエストボディを取得（空の場合もエラーにしない）
    const contentType = req.headers.get("content-type") || "";
    let body = {};
    if (contentType.includes("application/json")) {
      const text = await req.text();
      if (text.trim() === "") {
        throw new Error("Request body is empty");
      }
      body = JSON.parse(text);
    }

    const { priceId, userId } = body;

    if (!priceId || !userId) {
      throw new Error("Missing priceId or userId in request body");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: "https://abe-voice-portal.vercel.app/success.html",  // 本番URLに変更
      cancel_url: "https://abe-voice-portal.vercel.app",
      client_reference_id: userId,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});