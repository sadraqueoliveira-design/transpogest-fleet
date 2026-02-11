import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const vapidKey = Deno.env.get("FIREBASE_VAPID_KEY")?.trim();
  if (!vapidKey) {
    return new Response(JSON.stringify({ error: "VAPID key not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("VAPID key length:", vapidKey.length, "starts with:", vapidKey.substring(0, 5));

  return new Response(JSON.stringify({ vapidKey }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
