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
    const { username, password } = await req.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ success: false, error: "Username and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const basicAuth = btoa(`${username}:${password}`);
    const trackitRes = await fetch("https://i.trackit.pt/ws/vehiclesForUser", {
      headers: { Authorization: `Basic ${basicAuth}` },
    });

    if (!trackitRes.ok) {
      const body = await trackitRes.text();
      return new Response(
        JSON.stringify({ success: false, error: `API returned ${trackitRes.status}`, details: body }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await trackitRes.json();
    const vehicles = Array.isArray(data) ? data : data.data || data.vehicles || data.result || [];
    const vehicleList = Array.isArray(vehicles) ? vehicles : [];

    return new Response(
      JSON.stringify({ success: true, vehicle_count: vehicleList.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
