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
          // Log first vehicle structure for debugging
          console.log(`${client.name}: ${vehiclesData.length} veículos encontrados`);
          
          const vehiclesToUpsert = vehiclesData
            .filter((v: any) => v.mid || v.plate || v.info?.plate || v.registration || v.name)
            .map((v: any) => {
              // The API nests telemetry inside v.data
              const d = v.data || {};
              const pos = d.pos || {};
              const loc = pos.loc || {}; // lat/lon inside pos.loc
              const can = d.can || {};
              const fue = d.fue || {};
              const posExd = pos.exd || {};
              const dataExd = d.exd || {};
              
              const plate = v.info?.plate || v.plate || v.name || "SEM-PLACA";
              const brand = v.info?.brand || null;
              const model = v.info?.model || null;
              
              return {
                client_id: client.id,
                trackit_id: String(v.mid || v.id || plate),
                plate: plate.replace(/[\s]/g, "").toUpperCase(),
                brand: brand,
                model: model,

                // Position from pos.loc
                last_lat: loc.lat ?? null,
                last_lng: loc.lon ?? null,
                last_speed: pos.gsp != null ? Math.round(pos.gsp) : 0,

                // Telemetry
                fuel_level_percent: fue.flv ?? dataExd.flv ?? null,
                rpm: can.rpm ? Math.round(can.rpm) : null,
                odometer_km: pos.gkm ?? dataExd.odo ?? null,
                engine_hours: dataExd.egh ?? can.egh ?? null,

                // Temperature (Reefer)
                temperature_data: d.tmp || null,

                // Tachograph
                tachograph_status: d.drs ? JSON.stringify(d.drs) : null,

                updated_at: new Date().toISOString(),
              };
            });

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
