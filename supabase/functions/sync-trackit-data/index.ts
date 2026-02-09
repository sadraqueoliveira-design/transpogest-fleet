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
    const TRACKIT_USERNAME = Deno.env.get("TRACKIT_USERNAME");
    const TRACKIT_PASSWORD = Deno.env.get("TRACKIT_PASSWORD");
    if (!TRACKIT_USERNAME || !TRACKIT_PASSWORD) {
      throw new Error("Trackit credentials not configured");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch vehicles from Trackit API
    const basicAuth = btoa(`${TRACKIT_USERNAME}:${TRACKIT_PASSWORD}`);
    const trackitRes = await fetch("https://i.trackit.pt/ws/vehiclesForUser", {
      headers: { Authorization: `Basic ${basicAuth}` },
    });

    if (!trackitRes.ok) {
      const body = await trackitRes.text();
      throw new Error(`Trackit API error [${trackitRes.status}]: ${body}`);
    }

    const trackitData = await trackitRes.json();
    const vehicles = Array.isArray(trackitData) ? trackitData : trackitData.vehicles || [];

    let updated = 0;
    let errors: string[] = [];

    for (const v of vehicles) {
      const plate = v.plate || v.registration || v.name;
      if (!plate) continue;

      const updateData: Record<string, unknown> = {};

      // Position data
      if (v.pos) {
        if (v.pos.lat != null) updateData.last_lat = v.pos.lat;
        if (v.pos.lon != null) updateData.last_lng = v.pos.lon;
        if (v.pos.spd != null) updateData.last_speed = Math.round(v.pos.spd);
      }

      // Eco/fuel data
      if (v.eco?.exd?.flv != null) {
        updateData.fuel_level_percent = v.eco.exd.flv;
      }

      // Odometer
      if (v.eco?.exd?.odo != null) {
        updateData.odometer_km = v.eco.exd.odo;
      }
      if (v.odo != null) {
        updateData.odometer_km = v.odo;
      }

      // Engine hours
      if (v.eco?.exd?.egh != null) {
        updateData.engine_hours = v.eco.exd.egh;
      }

      // Tachograph status (drs = driver status)
      if (v.drs != null) {
        updateData.tachograph_status = JSON.stringify(v.drs);
      }

      // Temperature data (tmp)
      if (v.tmp != null) {
        updateData.temperature_data = v.tmp;
      }

      // RPM from CAN bus
      if (v.can?.rpm != null) {
        updateData.rpm = Math.round(v.can.rpm);
      } else if (v.eco?.exd?.rpm != null) {
        updateData.rpm = Math.round(v.eco.exd.rpm);
      }

      if (Object.keys(updateData).length === 0) continue;

      updateData.updated_at = new Date().toISOString();

      // Normalize plate for matching (remove spaces/dashes)
      const normalizedPlate = plate.replace(/[\s-]/g, "").toUpperCase();

      const { error } = await supabase
        .from("vehicles")
        .update(updateData)
        .ilike("plate", `%${normalizedPlate}%`);

      if (error) {
        errors.push(`${plate}: ${error.message}`);
      } else {
        updated++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_from_api: vehicles.length,
        updated,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("sync-trackit-data error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
