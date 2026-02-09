import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const THRESHOLDS = {
  low_fuel: 20,
  low_adblue: 10,
  low_reefer_fuel: 20,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch all vehicles
    const { data: vehicles, error: vErr } = await supabaseAdmin
      .from("vehicles")
      .select("id, plate, fuel_level_percent, tachograph_status, temperature_data");

    if (vErr) throw vErr;
    if (!vehicles || vehicles.length === 0) {
      return new Response(JSON.stringify({ message: "No vehicles", alerts: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get recent unacknowledged alerts to avoid duplicates (last 6 hours)
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: recentAlerts } = await supabaseAdmin
      .from("fuel_alerts")
      .select("vehicle_id, alert_type")
      .eq("acknowledged", false)
      .gte("created_at", sixHoursAgo);

    const recentSet = new Set(
      (recentAlerts || []).map((a) => `${a.vehicle_id}:${a.alert_type}`)
    );

    const newAlerts: Array<{
      vehicle_id: string;
      alert_type: string;
      level_percent: number;
      threshold_percent: number;
    }> = [];

    for (const v of vehicles) {
      let tacho: any = {};
      if (v.tachograph_status) {
        try { tacho = JSON.parse(v.tachograph_status); } catch {}
      }

      const fuel = v.fuel_level_percent ?? tacho.flv ?? null;
      const adblue = tacho.adbl ?? null;
      // Reefer fuel: check if vehicle has reefer data
      const td = v.temperature_data as any;
      const frt = tacho.frt ?? null;
      const hasReefer = frt != null || (td && Object.keys(td).length > 0);

      // Check fuel level
      if (fuel != null && fuel < THRESHOLDS.low_fuel) {
        const key = `${v.id}:low_fuel`;
        if (!recentSet.has(key)) {
          newAlerts.push({
            vehicle_id: v.id,
            alert_type: "low_fuel",
            level_percent: fuel,
            threshold_percent: THRESHOLDS.low_fuel,
          });
        }
      }

      // Check AdBlue
      if (adblue != null && adblue < THRESHOLDS.low_adblue) {
        const key = `${v.id}:low_adblue`;
        if (!recentSet.has(key)) {
          newAlerts.push({
            vehicle_id: v.id,
            alert_type: "low_adblue",
            level_percent: adblue,
            threshold_percent: THRESHOLDS.low_adblue,
          });
        }
      }

      // Check reefer fuel (for vehicles with reefer equipment)
      if (hasReefer && fuel != null && fuel < THRESHOLDS.low_reefer_fuel) {
        const key = `${v.id}:low_reefer_fuel`;
        if (!recentSet.has(key)) {
          newAlerts.push({
            vehicle_id: v.id,
            alert_type: "low_reefer_fuel",
            level_percent: fuel,
            threshold_percent: THRESHOLDS.low_reefer_fuel,
          });
        }
      }
    }

    if (newAlerts.length > 0) {
      const { error: insertErr } = await supabaseAdmin
        .from("fuel_alerts")
        .insert(newAlerts);
      if (insertErr) throw insertErr;
    }

    console.log(`Checked ${vehicles.length} vehicles, created ${newAlerts.length} new alerts`);

    return new Response(
      JSON.stringify({ checked: vehicles.length, new_alerts: newAlerts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("check-fuel-alerts error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
