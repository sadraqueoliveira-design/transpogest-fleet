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
    // 1. Iniciar o Cliente Supabase (Admin para poder ler senhas)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 2. Buscar Clientes com API Trackit ativa
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

    const results: Array<{
      client: string;
      status: string;
      count?: number;
      message?: string;
    }> = [];

    // 3. Loop por cada Cliente (Multi-Tenant)
    for (const client of clients) {
      console.log(`Sincronizando cliente: ${client.name}...`);

      if (!client.trackit_username || !client.trackit_password) {
        results.push({ client: client.name, status: "error", message: "Credenciais em falta" });
        continue;
      }

      // Codificar credenciais em Base64 para Basic Auth
      const credentials = btoa(`${client.trackit_username}:${client.trackit_password}`);

      // 4. Chamada à API Trackit (Endpoint /vehiclesForUser)
      // Fonte: Manual WebService v110 - Pág 9 (2.4.5)
      try {
        const trackitResponse = await fetch("https://i.trackit.pt/ws/vehiclesForUser", {
          method: "GET",
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/json",
          },
        });

        if (!trackitResponse.ok) {
          console.error(`Erro Trackit para ${client.name}: ${trackitResponse.statusText}`);
          results.push({ client: client.name, status: "error", message: `Falha na API Trackit [${trackitResponse.status}]` });
          continue;
        }

        const trackitJson = await trackitResponse.json();

        // Verificar erro no corpo da resposta JSON (Padrão Trackit)
        // Fonte: Manual WebService v110 - Pág 4 (2.3)
        if (trackitJson.error) {
          results.push({ client: client.name, status: "error", message: trackitJson.message || "Erro Trackit" });
          continue;
        }

        // A API pode retornar array direto ou {data: [...]}
        const vehiclesData = Array.isArray(trackitJson)
          ? trackitJson
          : trackitJson.data || trackitJson.vehicles || [];

        // 5. Mapeamento e Upsert (Salvar no Banco)
        if (vehiclesData.length > 0) {
          console.log(`${client.name}: ${vehiclesData.length} veículos encontrados`);

          // Helper: reverse geocode with Nominatim (rate limit: 1 req/sec)
          const reverseGeocode = async (lat: number, lon: number): Promise<string | null> => {
            try {
              const resp = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=14&addressdetails=1`,
                { headers: { "User-Agent": "FleetSync/1.0" } }
              );
              if (!resp.ok) return null;
              const data = await resp.json();
              const addr = data.address;
              if (!addr) return data.display_name?.split(",").slice(0, 2).join(",") || null;
              // Build short location: village/city, municipality
              const place = addr.village || addr.town || addr.city || addr.suburb || addr.hamlet || "";
              const region = addr.municipality || addr.county || addr.state || "";
              return [place, region].filter(Boolean).join(", ") || data.display_name?.split(",").slice(0, 2).join(",") || null;
            } catch { return null; }
          };
          
          const filteredVehicles = vehiclesData
            .filter((v: any) => v.mid || v.plate || v.info?.plate || v.registration || v.name);

          // Build vehicle records first
          const vehicleRecords = filteredVehicles.map((v: any) => {
              const d = v.data || {};
              const pos = d.pos || {};
              const loc = pos.loc || {};
              const drs = d.drs || {};
              const tmp = d.tmp || {};
              const plate = v.info?.plate || v.plate || v.name || "SEM-PLACA";
              const fuelLevel = drs.flv ?? d.fue?.flv ?? null;
              const rpmVal = drs.rpm ?? d.can?.rpm ?? null;
              const odometerVal = drs.ckm ?? pos.gkm ?? null;
              const engineHoursVal = drs.ehr ?? null;
              return {
                client_id: client.id,
                trackit_id: String(v.mid || v.id || plate),
                plate: plate.replace(/[\s]/g, "").toUpperCase(),
                brand: v.info?.brand || null,
                model: v.info?.model || null,
                last_lat: loc.lat ?? null,
                last_lng: loc.lon ?? null,
                last_speed: pos.gsp != null ? Math.round(pos.gsp) : 0,
                fuel_level_percent: fuelLevel,
                rpm: rpmVal != null ? Math.round(rpmVal) : null,
                odometer_km: odometerVal,
                engine_hours: engineHoursVal,
                temperature_data: Object.keys(tmp).length > 0 ? tmp : null,
                last_location_name: null as string | null,
                tachograph_status: Object.keys(drs).length > 0 ? JSON.stringify(drs) : null,
                updated_at: new Date().toISOString(),
              };
          });

          // Batch reverse geocode (5 at a time)
          const BATCH = 5;
          for (let i = 0; i < vehicleRecords.length; i += BATCH) {
            const batch = vehicleRecords.slice(i, i + BATCH);
            await Promise.all(batch.map(async (rec) => {
              if (rec.last_lat != null && rec.last_lng != null) {
                rec.last_location_name = await reverseGeocode(rec.last_lat, rec.last_lng);
              }
            }));
            if (i + BATCH < vehicleRecords.length) {
              await new Promise(r => setTimeout(r, 1100)); // respect 1 req/sec per batch
            }
          }

          const vehiclesToUpsert = vehicleRecords;

          // Upsert no Supabase (Atualiza se existir, Cria se novo)
          const { error: upsertError } = await supabaseAdmin
            .from("vehicles")
            .upsert(vehiclesToUpsert, { onConflict: "trackit_id" });

          if (upsertError) {
            console.error(`Erro ao salvar veículos de ${client.name}:`, upsertError);
            results.push({ client: client.name, status: "error", message: upsertError.message });
          } else {
            results.push({ client: client.name, status: "success", count: vehiclesData.length });
          }
        } else {
          results.push({ client: client.name, status: "success", count: 0, message: "Nenhum veículo retornado" });
        }

        // Atualizar last_sync_at do cliente
        await supabaseAdmin
          .from("clients")
          .update({ last_sync_at: new Date().toISOString() })
          .eq("id", client.id);

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        console.error(`Erro ao processar ${client.name}:`, msg);
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
