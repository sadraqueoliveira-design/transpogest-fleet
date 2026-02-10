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

    const results: Array<{ client: string; status: string; count?: number; message?: string }> = [];

    for (const client of clients) {
      console.log(`Sincronizando cliente: ${client.name}...`);

      if (!client.trackit_username || !client.trackit_password) {
        results.push({ client: client.name, status: "error", message: "Credenciais em falta" });
        continue;
      }

      const credentials = btoa(`${client.trackit_username}:${client.trackit_password}`);

      try {
        const trackitResponse = await fetch("https://i.trackit.pt/ws/vehiclesForUser", {
          method: "GET",
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/json",
          },
        });

        if (!trackitResponse.ok) {
          results.push({ client: client.name, status: "error", message: `Falha na API Trackit [${trackitResponse.status}]` });
          continue;
        }

        const trackitJson = await trackitResponse.json();

        if (trackitJson.error) {
          results.push({ client: client.name, status: "error", message: trackitJson.message || "Erro Trackit" });
          continue;
        }

        const vehiclesData = Array.isArray(trackitJson)
          ? trackitJson
          : trackitJson.data || trackitJson.vehicles || [];

        if (vehiclesData.length > 0) {
          console.log(`${client.name}: ${vehiclesData.length} veículos encontrados`);

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
              const place = addr.village || addr.town || addr.city || addr.suburb || addr.hamlet || "";
              const region = addr.municipality || addr.county || addr.state || "";
              return [place, region].filter(Boolean).join(", ") || data.display_name?.split(",").slice(0, 2).join(",") || null;
            } catch { return null; }
          };

          const filteredVehicles = vehiclesData
            .filter((v: any) => v.mid || v.plate || v.info?.plate || v.registration || v.name);

          const trailerRecords: Array<{
            plate: string;
            internal_id: string | null;
            status: string;
            last_lat: number | null;
            last_lng: number | null;
            last_linked_vehicle_id: string | null;
          }> = [];

          const vehicleRecords = filteredVehicles.map((v: any) => {
            const d = v.data || {};
            const pos = d.pos || {};
            const loc = pos.loc || {};
            const drs = d.drs || {};
            const tmp = d.tmp || {};
            const eco = d.eco || drs;
            const plate = v.info?.plate || v.plate || v.name || "SEM-PLACA";
            const fuelLevel = drs.flv ?? d.fue?.flv ?? null;
            const rpmVal = drs.rpm ?? d.can?.rpm ?? null;
            const odometerVal = drs.ckm ?? pos.gkm ?? null;
            const engineHoursVal = drs.ehr ?? null;
            const adblueLevel = eco.adbl ?? drs.adbl ?? d.can?.adbl ?? null;

            // Reefer set points from temperature data
            const setPoint1 = tmp.sp1 ?? tmp.setpoint1 ?? null;
            const setPoint2 = tmp.sp2 ?? tmp.setpoint2 ?? null;

            // Trailer coupling (Atrelamento)
            const trailerInfo = d.trailer || d.atrelamento || v.trailer;
            if (trailerInfo) {
              const tPlate = trailerInfo.plate || trailerInfo.registration || null;
              if (tPlate) {
                trailerRecords.push({
                  plate: tPlate.replace(/[\s]/g, "").toUpperCase(),
                  internal_id: trailerInfo.type || trailerInfo.internal_id || null,
                  status: "coupled",
                  last_lat: loc.lat ?? null,
                  last_lng: loc.lon ?? null,
                  last_linked_vehicle_id: null, // will be set after upsert
                });
              }
            }

            // Legal download dates
            const lastVehicleDownload = drs.last_download_at || d.tacho?.last_download_at || null;

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
              adblue_level_percent: adblueLevel,
              reefer_set_point_1: setPoint1,
              reefer_set_point_2: setPoint2,
              last_vehicle_unit_download_at: lastVehicleDownload,
              next_vehicle_unit_download_due: lastVehicleDownload
                ? new Date(new Date(lastVehicleDownload).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
                : null,
              updated_at: new Date().toISOString(),
            };
          });

          // Batch reverse geocode
          const BATCH = 5;
          for (let i = 0; i < vehicleRecords.length; i += BATCH) {
            const batch = vehicleRecords.slice(i, i + BATCH);
            await Promise.all(batch.map(async (rec: any) => {
              if (rec.last_lat != null && rec.last_lng != null) {
                rec.last_location_name = await reverseGeocode(rec.last_lat, rec.last_lng);
              }
            }));
            if (i + BATCH < vehicleRecords.length) {
              await new Promise(r => setTimeout(r, 1100));
            }
          }

          // Detect refueling events
          const trackitIds = vehicleRecords.map((r: any) => r.trackit_id);
          const { data: existingVehicles } = await supabaseAdmin
            .from("vehicles")
            .select("id, trackit_id, fuel_level_percent")
            .in("trackit_id", trackitIds);

          const existingMap = new Map(
            (existingVehicles || []).map((v: any) => [v.trackit_id, v])
          );

          const refuelingEvents: Array<{
            vehicle_id: string;
            fuel_before: number;
            fuel_after: number;
            estimated_liters: number | null;
            source: string;
          }> = [];

          // AdBlue alerts
          const adblueAlerts: Array<{
            vehicle_id: string;
            alert_type: string;
            level_percent: number;
            threshold_percent: number;
          }> = [];

          for (const rec of vehicleRecords) {
            const existing = existingMap.get(rec.trackit_id);
            if (!existing) continue;

            // Refueling detection
            const oldFuel = existing.fuel_level_percent;
            const newFuel = rec.fuel_level_percent;
            if (oldFuel != null && newFuel != null) {
              const increase = newFuel - oldFuel;
              if (increase >= 15) {
                refuelingEvents.push({
                  vehicle_id: existing.id,
                  fuel_before: oldFuel,
                  fuel_after: newFuel,
                  estimated_liters: null,
                  source: "trackit",
                });
              }
            }

            // AdBlue < 10% alert
            if (rec.adblue_level_percent != null && rec.adblue_level_percent < 10) {
              adblueAlerts.push({
                vehicle_id: existing.id,
                alert_type: "adblue_low",
                level_percent: rec.adblue_level_percent,
                threshold_percent: 10,
              });
            }
          }

          // Upsert vehicles
          const { error: upsertError } = await supabaseAdmin
            .from("vehicles")
            .upsert(vehicleRecords, { onConflict: "trackit_id" });

          // Insert refueling events
          if (refuelingEvents.length > 0) {
            const { error: refuelErr } = await supabaseAdmin
              .from("refueling_events")
              .insert(refuelingEvents);
            if (refuelErr) console.error("Error inserting refueling events:", refuelErr.message);
            else console.log(`${client.name}: ${refuelingEvents.length} refueling event(s) detected`);
          }

          // Insert AdBlue alerts (avoid duplicates by checking recent)
          for (const alert of adblueAlerts) {
            const { data: existing } = await supabaseAdmin
              .from("fuel_alerts")
              .select("id")
              .eq("vehicle_id", alert.vehicle_id)
              .eq("alert_type", "adblue_low")
              .eq("acknowledged", false)
              .limit(1);
            if (!existing || existing.length === 0) {
              await supabaseAdmin.from("fuel_alerts").insert(alert);
            }
          }

          // Upsert trailers
          if (trailerRecords.length > 0) {
            // Link trailer to vehicle IDs
            const { data: upsertedVehicles } = await supabaseAdmin
              .from("vehicles")
              .select("id, trackit_id, plate")
              .in("trackit_id", trackitIds);

            const plateToId = new Map(
              (upsertedVehicles || []).map((v: any) => [v.plate, v.id])
            );

            for (const tr of trailerRecords) {
              // Try to find the parent vehicle
              const parentVehicle = vehicleRecords.find((vr: any) => {
                const d = filteredVehicles.find((fv: any) => {
                  const p = fv.info?.plate || fv.plate || fv.name || "";
                  return p.replace(/[\s]/g, "").toUpperCase() === vr.plate;
                });
                if (!d) return false;
                const trailerInfo = d.data?.trailer || d.data?.atrelamento || d.trailer;
                return trailerInfo?.plate?.replace(/[\s]/g, "").toUpperCase() === tr.plate;
              });
              if (parentVehicle) {
                tr.last_linked_vehicle_id = plateToId.get(parentVehicle.plate) || null;
              }
            }

            for (const tr of trailerRecords) {
              const { data: existingTrailer } = await supabaseAdmin
                .from("trailers")
                .select("id")
                .eq("plate", tr.plate)
                .limit(1);
              if (existingTrailer && existingTrailer.length > 0) {
                await supabaseAdmin.from("trailers").update(tr).eq("id", existingTrailer[0].id);
              } else {
                await supabaseAdmin.from("trailers").insert(tr);
              }
            }
          }

          if (upsertError) {
            console.error(`Erro ao salvar veículos de ${client.name}:`, upsertError);
            results.push({ client: client.name, status: "error", message: upsertError.message });
          } else {
            results.push({ client: client.name, status: "success", count: vehiclesData.length });
          }
        } else {
          results.push({ client: client.name, status: "success", count: 0, message: "Nenhum veículo retornado" });
        }

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
