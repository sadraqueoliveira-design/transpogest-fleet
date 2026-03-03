import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch all active clients with Trackit credentials
    const { data: clients, error: clientsError } = await supabaseAdmin
      .from("clients")
      .select("id, name, trackit_username, trackit_password")
      .eq("api_enabled", true);

    if (clientsError) throw clientsError;
    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhum cliente com API ativa." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ client: string; status: string; matches?: number; total?: number; message?: string }> = [];

    for (const client of clients) {
      if (!client.trackit_username || !client.trackit_password) {
        results.push({ client: client.name, status: "skip", message: "Sem credenciais" });
        continue;
      }

      const credentials = btoa(`${client.trackit_username}:${client.trackit_password}`);

      try {
        console.log(`[COMPLIANCE] ${client.name}: fetching driverList...`);

        // 55s timeout — this function has the full 60s wall clock to itself
        const res = await fetch("https://i.trackit.pt/ws/driverList", {
          headers: { Authorization: `Basic ${credentials}` },
          signal: AbortSignal.timeout(55000),
        });

        if (!res.ok) {
          console.warn(`[COMPLIANCE] ${client.name}: HTTP ${res.status}`);
          results.push({ client: client.name, status: "error", message: `HTTP ${res.status}` });
          continue;
        }

        const json = await res.json();
        const driverList = json.data || json || [];
        console.log(`[COMPLIANCE] ${client.name}: ${driverList.length} drivers received`);

        if (driverList.length === 0) {
          results.push({ client: client.name, status: "success", matches: 0, total: 0 });
          continue;
        }

        // Load vehicles for this client
        const { data: vehicles, error: vErr } = await supabaseAdmin
          .from("vehicles")
          .select("id, plate, trackit_id, tachograph_status")
          .eq("client_id", client.id)
          .not("trackit_id", "is", null);

        if (vErr) {
          console.error(`[COMPLIANCE] ${client.name}: DB error: ${vErr.message}`);
          results.push({ client: client.name, status: "error", message: vErr.message });
          continue;
        }

        let matchCount = 0;
        for (const drv of driverList) {
          const td = drv.tacho_data;
          if (!td || !td.current_mobile || !td.is_auth) continue;

          const matchingVehicle = (vehicles || []).find(
            (v: any) => parseInt(v.trackit_id) === td.current_mobile
          );
          if (!matchingVehicle) continue;

          // Parse existing tachograph_status and merge compliance data
          let existingStatus: any = {};
          try { existingStatus = JSON.parse(matchingVehicle.tachograph_status || "{}"); } catch { /* ok */ }

          existingStatus.tacho_compliance = {
            total_drive_journay: td.total_drive_journay ?? 0,
            total_drive_week: td.total_drive_week ?? 0,
            total_drive_fortnight: td.total_drive_fortnight ?? 0,
            perc_drive_journay: td.perc_drive_journay ?? 0,
            perc_drive_week: td.perc_drive_week ?? 0,
            perc_drive_fortnight: td.perc_drive_fortnight ?? 0,
            extended_driver_count: td.extended_driver_count ?? 0,
            current_state: td.current_state ?? 0,
            is_old_data: td.is_old_data ?? false,
            last_daily_rest: td.last_daily_rest ?? null,
            last_weekly_rest: td.last_weekly_rest ?? null,
            driver_uid: drv.uid,
            dr_code: drv.dr_code,
            updated_at: new Date().toISOString(),
          };

          const { error: updErr } = await supabaseAdmin
            .from("vehicles")
            .update({ tachograph_status: JSON.stringify(existingStatus) })
            .eq("id", matchingVehicle.id);

          if (updErr) {
            console.warn(`[COMPLIANCE] ${client.name}: error updating ${matchingVehicle.plate}: ${updErr.message}`);
          } else {
            matchCount++;
          }
        }

        console.log(`[COMPLIANCE] ${client.name}: ${matchCount}/${driverList.length} vehicles updated`);
        results.push({ client: client.name, status: "success", matches: matchCount, total: driverList.length });

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        console.error(`[COMPLIANCE] ${client.name}: ${msg}`);
        results.push({ client: client.name, status: "error", message: msg });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
