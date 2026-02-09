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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all clients with API enabled
    const { data: clients, error: clientsErr } = await supabase
      .from("clients")
      .select("id, name, trackit_username, trackit_password")
      .eq("api_enabled", true);

    if (clientsErr) throw new Error("Failed to fetch clients: " + clientsErr.message);
    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No clients with API enabled", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ client_id: string; client_name: string; total: number; updated: number; created: number; errors?: string[] }> = [];

    for (const client of clients) {
      if (!client.trackit_username || !client.trackit_password) {
        results.push({ client_id: client.id, client_name: client.name, total: 0, updated: 0, created: 0, errors: ["Missing credentials"] });
        continue;
      }

      try {
        const basicAuth = btoa(`${client.trackit_username}:${client.trackit_password}`);
        const trackitRes = await fetch("https://i.trackit.pt/ws/vehiclesForUser", {
          headers: { Authorization: `Basic ${basicAuth}` },
        });

        if (!trackitRes.ok) {
          const body = await trackitRes.text();
          results.push({ client_id: client.id, client_name: client.name, total: 0, updated: 0, created: 0, errors: [`API error [${trackitRes.status}]: ${body}`] });
          continue;
        }

        const trackitData = await trackitRes.json();
        const vehicles = Array.isArray(trackitData) ? trackitData : trackitData.vehicles || [];

        let updated = 0;
        let created = 0;
        const errors: string[] = [];

        for (const v of vehicles) {
          const plate = v.plate || v.registration || v.name;
          if (!plate) continue;

          const updateData: Record<string, unknown> = {};

          // Position
          if (v.pos) {
            if (v.pos.lat != null) updateData.last_lat = v.pos.lat;
            if (v.pos.lon != null) updateData.last_lng = v.pos.lon;
            if (v.pos.spd != null) updateData.last_speed = Math.round(v.pos.spd);
          }

          // Fuel
          if (v.eco?.exd?.flv != null) updateData.fuel_level_percent = v.eco.exd.flv;

          // Odometer
          if (v.eco?.exd?.odo != null) updateData.odometer_km = v.eco.exd.odo;
          if (v.odo != null) updateData.odometer_km = v.odo;

          // Engine hours
          if (v.eco?.exd?.egh != null) updateData.engine_hours = v.eco.exd.egh;

          // Tachograph
          if (v.drs != null) updateData.tachograph_status = JSON.stringify(v.drs);

          // Temperature
          if (v.tmp != null) updateData.temperature_data = v.tmp;

          // RPM
          if (v.can?.rpm != null) updateData.rpm = Math.round(v.can.rpm);
          else if (v.eco?.exd?.rpm != null) updateData.rpm = Math.round(v.eco.exd.rpm);

          if (Object.keys(updateData).length === 0) continue;

          updateData.updated_at = new Date().toISOString();
          updateData.client_id = client.id;

          const normalizedPlate = plate.replace(/[\s-]/g, "").toUpperCase();

          // Try update first
          const { data: existing } = await supabase
            .from("vehicles")
            .select("id")
            .ilike("plate", `%${normalizedPlate}%`)
            .limit(1)
            .maybeSingle();

          if (existing) {
            const { error } = await supabase
              .from("vehicles")
              .update(updateData)
              .eq("id", existing.id);
            if (error) errors.push(`${plate}: ${error.message}`);
            else updated++;
          } else {
            // Create new vehicle for this client
            const { error } = await supabase
              .from("vehicles")
              .insert({ plate: normalizedPlate, ...updateData });
            if (error) errors.push(`${plate} (create): ${error.message}`);
            else created++;
          }
        }

        // Update last_sync_at
        await supabase.from("clients").update({ last_sync_at: new Date().toISOString() }).eq("id", client.id);

        results.push({
          client_id: client.id,
          client_name: client.name,
          total: vehicles.length,
          updated,
          created,
          errors: errors.length > 0 ? errors : undefined,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        results.push({ client_id: client.id, client_name: client.name, total: 0, updated: 0, created: 0, errors: [msg] });
      }
    }

    return new Response(
      JSON.stringify({ success: true, clients_processed: results.length, results }),
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
