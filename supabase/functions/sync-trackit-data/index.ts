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
        // Fetch vehicles (fast path, ~2-5s)
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

          // Pre-fetch tachograph cards for driver matching
          const { data: tachCards } = await supabaseAdmin
            .from("tachograph_cards")
            .select("card_number, driver_id, driver_name");
          const cardToDriver = new Map(
            (tachCards || [])
              .filter((c: any) => c.driver_id)
              .map((c: any) => [c.card_number, c.driver_id])
          );
          const cardToDriverName = new Map(
            (tachCards || [])
              .filter((c: any) => c.driver_name)
              .map((c: any) => [c.card_number, c.driver_name])
          );

          // Normalize card number: strip country prefix (e.g. "5B.", "PT,", "E.")
          const normalizeCardNumber = (c: string) => c.replace(/^[A-Z]{1,3}[.,]\s*/, '');

          // Pre-fetch employees for employee_number lookup by name AND card_number
          const { data: employeesData } = await supabaseAdmin
            .from("employees")
            .select("full_name, employee_number, card_number");
          const nameToEmployeeNumber = new Map(
            (employeesData || []).map((e: any) => [e.full_name?.toLowerCase()?.trim(), e.employee_number])
          );
          // Build normalized card → employee lookup (for cards stored with country prefix)
          const cardToEmployee = new Map<string, { full_name: string; employee_number: number }>();
          for (const emp of (employeesData || [])) {
            if (emp.card_number) {
              const normCard = normalizeCardNumber(emp.card_number).replace(/[\s]/g, "").toUpperCase();
              cardToEmployee.set(normCard, { full_name: emp.full_name, employee_number: emp.employee_number });
            }
          }

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
            // Extract mobile number from reference field (format: "1080 | 42-HX-81")
            const refStr = v.info?.reference || "";
            const mobileNumber = refStr.split("|")[0]?.trim() || null;
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

            // === TACHOGRAPH-FIRST DRIVER ASSIGNMENT ===
            // Extract driver card number — try dc1 first, then tac.1.idc, then fallback to exd.eco.idc / drs.idc
            const tacSlot1 = d.tac?.["1"]?.idc ?? null;
            const driverCardNumber = drs.dc1 ?? tacSlot1 ?? d.exd?.eco?.idc ?? drs.idc ?? null;
            const driverState1 = drs.ds1 ?? d.exd?.eco?.ds1 ?? null;

            // Detailed logging for card field debugging
            console.log(`[CARD-DEBUG] ${plate}: dc1=${drs.dc1 ?? "N/A"}, tac.1.idc=${tacSlot1 ?? "N/A"}, exd.eco.idc=${d.exd?.eco?.idc ?? "N/A"}, drs.idc=${drs.idc ?? "N/A"} → using: ${driverCardNumber ?? "NONE"}, ds1=${driverState1 ?? "N/A"}`);

            // Determine if a valid card is inserted
            const EMPTY_CARD = "0000000000000000";
            const cardSource = drs.dc1 ? "dc1" : tacSlot1 ? "tac.1.idc" : d.exd?.eco?.idc ? "exd.eco.idc" : drs.idc ? "drs.idc" : "none";
            
            // FIX: Don't trust tac.1.idc when ds1=0 (rest) — it's a cached/persistent value
            const isCachedCardOnly = cardSource === "tac.1.idc" && driverState1 === 0;
            
            const hasValidCard = driverCardNumber
              && driverCardNumber !== ""
              && driverCardNumber !== EMPTY_CARD
              && driverCardNumber !== "0"
              && !isCachedCardOnly;
            
            if (isCachedCardOnly && driverCardNumber) {
              console.log(`[CARD-CACHED] ${plate}: ignoring tac.1.idc=${driverCardNumber} because ds1=0 (rest/cached)`);
            }

            let resolvedDriverId: string | null = null;
            if (hasValidCard) {
              // Normalize card number: remove spaces, uppercase
              const normalizedCard = driverCardNumber.replace(/[\s]/g, "").toUpperCase();
              // Try exact match first, then try without leading zeros and last 2 digits
              resolvedDriverId = cardToDriver.get(normalizedCard) || null;
              if (!resolvedDriverId) {
                // Try normalized matching (strip leading zeros & last 2 check digits)
                const stripped = normalizedCard.replace(/^0+/, "").slice(0, -2);
                for (const [cardNum, driverId] of cardToDriver.entries()) {
                  const strippedCard = cardNum.replace(/^0+/, "").slice(0, -2);
                  if (strippedCard === stripped) {
                    resolvedDriverId = driverId as string;
                    break;
                  }
                }
              }
              if (!resolvedDriverId) {
                console.log(`${client.name}: Unknown card ${normalizedCard} on vehicle ${plate} — no matching driver found`);
              }
            }
            // If no valid card → resolvedDriverId stays null (auto-logout)

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
              tachograph_status: (() => {
                // Enrich tachograph_status with normalized card fields
                const cardSource = drs.dc1 ? "dc1" : tacSlot1 ? "tac.1.idc" : d.exd?.eco?.idc ? "exd.eco.idc" : drs.idc ? "drs.idc" : "none";
                const enriched: any = {
                  ...drs,
                  card_slot_1: hasValidCard ? driverCardNumber : null,
                  card_present: !!hasValidCard,
                  card_source: cardSource,
                };
                // Extract compliance data from tac object (available in vehiclesForUser)
                const tacData = d.tac || {};
                const slot1 = tacData["1"] || {};
                if (Object.keys(tacData).length > 0 || driverState1 != null) {
                  enriched.tacho_compliance = {
                    driver_state: driverState1,
                    ds1_label: driverState1 === 0 ? "rest" : driverState1 === 1 ? "available" : driverState1 === 2 ? "work" : driverState1 === 3 ? "driving" : "unknown",
                    // Slot 1 tachograph data
                    slot1_card: slot1.idc || null,
                    slot1_country: slot1.cnt || null,
                    slot1_name: slot1.nm || null,
                    slot1_surname: slot1.snm || null,
                    // Driving/rest durations from tac object
                    continuous_driving_time: tacData.cdt ?? drs.cdt ?? null,
                    cumulative_break_time: tacData.cbt ?? drs.cbt ?? null,
                    daily_driving_time: tacData.ddt ?? null,
                    weekly_driving_time: tacData.wdt ?? null,
                    // Activity durations
                    current_activity_duration: tacData.cad ?? null,
                    daily_rest_time: tacData.drt ?? null,
                    weekly_rest_time: tacData.wrt ?? null,
                    // Speed and position context
                    speed: pos.gsp ?? null,
                    rpm: rpmVal,
                    // Timestamp
                    tmx: drs.tmx || null,
                    updated_at: new Date().toISOString(),
                  };
                }
                return Object.keys(drs).length > 0 || hasValidCard ? JSON.stringify(enriched) : null;
              })(),
              adblue_level_percent: adblueLevel,
              reefer_set_point_1: setPoint1,
              reefer_set_point_2: setPoint2,
              last_vehicle_unit_download_at: lastVehicleDownload,
              next_vehicle_unit_download_due: lastVehicleDownload
                ? new Date(new Date(lastVehicleDownload).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
                : null,
              updated_at: new Date().toISOString(),
              mobile_number: mobileNumber,
              current_driver_id: resolvedDriverId,
            };
          });

          // Fetch existing vehicles BEFORE geocoding so we can skip unchanged positions
          const trackitIds = vehicleRecords.map((r: any) => r.trackit_id);
          const { data: existingVehicles } = await supabaseAdmin
            .from("vehicles")
            .select("id, trackit_id, fuel_level_percent, tachograph_status, card_inserted_at, last_lat, last_lng, last_location_name")
            .in("trackit_id", trackitIds);

          const existingMap = new Map(
            (existingVehicles || []).map((v: any) => [v.trackit_id, v])
          );

          // Pre-fetch last REAL insertion event per plate from card_events
          // This avoids relying on vehicles.card_inserted_at which may have been overwritten by tmx
          const allPlates = vehicleRecords.map((r: any) => r.plate).filter(Boolean);
          const { data: lastInsertions } = await supabaseAdmin
            .from("card_events")
            .select("plate, event_at")
            .eq("event_type", "inserted")
            .in("plate", allPlates)
            .order("event_at", { ascending: false });
          const lastRealInsertionMap = new Map<string, { date: string; timestamp: string }>();
          for (const row of (lastInsertions || []) as Array<{ plate: string; event_at: string }>) {
            if (!lastRealInsertionMap.has(row.plate)) {
              lastRealInsertionMap.set(row.plate, {
                date: new Date(row.event_at).toDateString(),
                timestamp: row.event_at,
              });
            }
          }
          console.log(`[CARD-EVENTS-MAP] Pre-loaded last real insertions for ${lastRealInsertionMap.size} plates`);

          // Batch reverse geocode — skip vehicles whose position hasn't changed
          const BATCH = 5;
          const POSITION_THRESHOLD = 0.005; // ~500m — accounts for GPS drift on parked vehicles
          let geocodeSkipped = 0;
          let geocodeFetched = 0;
          const toGeocode: any[] = [];

          for (const rec of vehicleRecords) {
            if (rec.last_lat == null || rec.last_lng == null) continue;
            const existing = existingMap.get(rec.trackit_id);
            if (
              existing &&
              existing.last_lat != null &&
              existing.last_lng != null &&
              Math.abs(rec.last_lat - existing.last_lat) < POSITION_THRESHOLD &&
              Math.abs(rec.last_lng - existing.last_lng) < POSITION_THRESHOLD
            ) {
              // Position unchanged — reuse existing location name (may be null)
              rec.last_location_name = existing.last_location_name || null;
              geocodeSkipped++;
            } else {
              toGeocode.push(rec);
            }
          }

          // Further cap geocoding to max 50 to guarantee fast execution
          const MAX_GEOCODE = 50;
          if (toGeocode.length > MAX_GEOCODE) {
            console.log(`[GEOCODE] Capping from ${toGeocode.length} to ${MAX_GEOCODE}`);
            // Keep first MAX_GEOCODE, set rest to null location
            toGeocode.splice(MAX_GEOCODE);
          }

          console.log(`[GEOCODE] ${toGeocode.length} vehicles to geocode, ${geocodeSkipped} skipped (unchanged position)`);

          for (let i = 0; i < toGeocode.length; i += BATCH) {
            const batch = toGeocode.slice(i, i + BATCH);
            await Promise.all(batch.map(async (rec: any) => {
              rec.last_location_name = await reverseGeocode(rec.last_lat, rec.last_lng);
              geocodeFetched++;
            }));
            if (i + BATCH < toGeocode.length) {
              await new Promise(r => setTimeout(r, 300));
            }
          }

          console.log(`[GEOCODE] Completed: ${geocodeFetched} fetched`);

          // Auto-register unknown cards (deferred from sync map above)
          const unknownCards = new Set<string>();
          for (const rec of vehicleRecords) {
            if (rec.current_driver_id === null && rec.tachograph_status) {
              try {
                const tacho = JSON.parse(rec.tachograph_status);
                if (tacho.card_present && tacho.card_slot_1) {
                  const cn = tacho.card_slot_1;
                  if (!cardToDriver.has(cn) && !cardToDriverName.has(cn)) {
                    unknownCards.add(cn);
                  }
                }
              } catch { /* ignore */ }
            }
          }
          if (unknownCards.size > 0) {
            const cardsToInsert = Array.from(unknownCards).map(cn => ({ card_number: cn }));
            const { error: autoRegErr } = await supabaseAdmin
              .from("tachograph_cards")
              .upsert(cardsToInsert, { onConflict: "card_number", ignoreDuplicates: true });
            if (autoRegErr) {
              console.log(`[CARD-AUTOREGISTER] Error: ${autoRegErr.message}`);
            } else {
              console.log(`[CARD-AUTOREGISTER] Registered ${unknownCards.size} unknown cards: ${Array.from(unknownCards).join(", ")}`);
            }
          }

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

          // === CARD INSERTION TRACKING ===
          // Detect card state changes and set card_inserted_at accordingly.
          // For new insertions and backfills, query the Trackit /ws/events endpoint
          // for event 45 (Driver Card Inserted Slot 1) to get the real insertion time.
          // Falls back to drs.tmx if events are unavailable.

          // Helper: fetch the most recent card insertion event timestamp for a vehicle
          // Fetch card insertion/removal events from Trackit API
          // Returns { insertionTime, wasRemoved } — wasRemoved=true if event 46 is more recent than event 45
          const fetchCardEvents = async (vehicleMid: number, afterTimestamp?: string | null, customDateBegin?: string | null): Promise<{ insertionTime: string | null; wasRemoved: boolean; removalTime: string | null }> => {
            try {
              const now = new Date();
              const defaultBegin = new Date(now.getTime() - 24 * 60 * 60 * 1000);
              const dateBegin = customDateBegin ? new Date(customDateBegin) : defaultBegin;
              const fmt = (d: Date) => d.toISOString().replace("T", " ").substring(0, 19);

              // Query both event 45 (Card Inserted Slot 1) and event 46 (Card Removed Slot 1)
              const eventsRes = await fetch("https://i.trackit.pt/ws/events", {
                method: "POST",
                headers: {
                  Authorization: `Basic ${credentials}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  vehicles: [vehicleMid],
                  events: [45, 46],
                  dateBegin: fmt(dateBegin),
                  dateEnd: fmt(now),
                }),
              });

              if (!eventsRes.ok) {
                console.log(`[CARD-EVENTS] Failed to fetch events for mid=${vehicleMid}: HTTP ${eventsRes.status}`);
                await eventsRes.text();
                return { insertionTime: null, wasRemoved: false, removalTime: null };
              }

              const eventsJson = await eventsRes.json();
              if (eventsJson.error) {
                console.log(`[CARD-EVENTS] API error for mid=${vehicleMid}: ${eventsJson.message || eventsJson.error || JSON.stringify(eventsJson)}`);
                return { insertionTime: null, wasRemoved: false, removalTime: null };
              }

              const allEvents = eventsJson.data || [];
              if (allEvents.length === 0) {
                console.log(`[CARD-EVENTS] No events 45/46 found for mid=${vehicleMid} since ${fmt(dateBegin)}`);
                return { insertionTime: null, wasRemoved: false, removalTime: null };
              }

              // Separate insertion (45) and removal (46) events
              const insertions = allEvents.filter((e: any) => e.eventType === 45 || e.eventId === 45);
              const removals = allEvents.filter((e: any) => e.eventType === 46 || e.eventId === 46);

              console.log(`[CARD-EVENTS] mid=${vehicleMid}: ${insertions.length} insertions, ${removals.length} removals since ${fmt(dateBegin)}`);

              // Check if the most recent event overall is a removal
              const mostRecentInsertion = insertions
                .filter((e: any) => e.eventStatus === 1)
                .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
              const mostRecentRemoval = removals
                .filter((e: any) => e.eventStatus === 1)
                .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

              // If most recent removal is after most recent insertion → card was removed
              if (mostRecentRemoval && mostRecentInsertion) {
                const removalMs = new Date(mostRecentRemoval.timestamp).getTime();
                const insertionMs = new Date(mostRecentInsertion.timestamp).getTime();
                if (removalMs > insertionMs) {
                  console.log(`[CARD-EVENTS] mid=${vehicleMid}: removal (${mostRecentRemoval.timestamp}) is more recent than insertion (${mostRecentInsertion.timestamp})`);
                  return { insertionTime: null, wasRemoved: true, removalTime: new Date(mostRecentRemoval.timestamp).toISOString() };
                }
              } else if (mostRecentRemoval && !mostRecentInsertion) {
                console.log(`[CARD-EVENTS] mid=${vehicleMid}: only removal found (${mostRecentRemoval.timestamp}), no insertion`);
                return { insertionTime: null, wasRemoved: true, removalTime: new Date(mostRecentRemoval.timestamp).toISOString() };
              }

              // Process insertion events (original logic)
              if (insertions.length === 0) {
                return { insertionTime: null, wasRemoved: false, removalTime: null };
              }

              const afterMs = afterTimestamp ? new Date(afterTimestamp).getTime() : 0;
              const activeEvents = insertions
                .filter((e: any) => e.eventStatus === 1 && (!afterTimestamp || new Date(e.timestamp).getTime() > afterMs))
                .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

              const mostRecent = activeEvents[0] || (afterTimestamp ? null : insertions[insertions.length - 1]);
              if (!mostRecent) {
                console.log(`[CARD-EVENTS] No event 45 found for mid=${vehicleMid} after ${afterTimestamp}`);
                return { insertionTime: null, wasRemoved: false, removalTime: null };
              }
              const eventTimestamp = mostRecent.timestamp;
              console.log(`[CARD-EVENTS] Found event 45 for mid=${vehicleMid}: timestamp=${eventTimestamp}, total=${insertions.length}${afterTimestamp ? `, filtered after=${afterTimestamp}` : ""}`);
              return { insertionTime: eventTimestamp ? new Date(eventTimestamp).toISOString() : null, wasRemoved: false, removalTime: null };
            } catch (err) {
              console.log(`[CARD-EVENTS] Error fetching events for mid=${vehicleMid}: ${err}`);
              return { insertionTime: null, wasRemoved: false, removalTime: null };
            }
          };

          // Bulk fetch card events for multiple vehicles in a single API call
          const fetchCardEventsBulk = async (vehicleMids: number[], dateBegin: Date): Promise<Map<number, { insertionTime: string | null; wasRemoved: boolean; removalTime: string | null }>> => {
            const resultMap = new Map<number, { insertionTime: string | null; wasRemoved: boolean; removalTime: string | null }>();
            if (vehicleMids.length === 0) return resultMap;
            try {
              const now = new Date();
              const fmt = (d: Date) => d.toISOString().replace("T", " ").substring(0, 19);
              console.log(`[CARD-EVENTS-BULK] Fetching events 45/46 for ${vehicleMids.length} vehicles since ${fmt(dateBegin)}`);

              const eventsRes = await fetch("https://i.trackit.pt/ws/events", {
                method: "POST",
                headers: {
                  Authorization: `Basic ${credentials}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  vehicles: vehicleMids,
                  events: [45, 46],
                  dateBegin: fmt(dateBegin),
                  dateEnd: fmt(now),
                }),
              });

              if (!eventsRes.ok) {
                console.log(`[CARD-EVENTS-BULK] Failed: HTTP ${eventsRes.status}`);
                await eventsRes.text();
                return resultMap;
              }

              const eventsJson = await eventsRes.json();
              if (eventsJson.error) {
                console.log(`[CARD-EVENTS-BULK] API error: ${eventsJson.message || JSON.stringify(eventsJson)}`);
                return resultMap;
              }

              const allEvents = eventsJson.data || [];
              console.log(`[CARD-EVENTS-BULK] Got ${allEvents.length} total events for ${vehicleMids.length} vehicles`);

              // Group events by vehicleId
              const byVehicle = new Map<number, any[]>();
              for (const e of allEvents) {
                const vid = e.vehicleId;
                if (!byVehicle.has(vid)) byVehicle.set(vid, []);
                byVehicle.get(vid)!.push(e);
              }

              // Process per vehicle
              for (const mid of vehicleMids) {
                const vEvents = byVehicle.get(mid) || [];
                if (vEvents.length === 0) {
                  // No events found for this vehicle
                  continue;
                }

                const insertions = vEvents.filter((e: any) => e.eventType === 45 || e.eventId === 45);
                const removals = vEvents.filter((e: any) => e.eventType === 46 || e.eventId === 46);

                const mostRecentInsertion = insertions
                  .filter((e: any) => e.eventStatus === 1)
                  .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                const mostRecentRemoval = removals
                  .filter((e: any) => e.eventStatus === 1)
                  .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

                if (mostRecentRemoval && mostRecentInsertion) {
                  if (new Date(mostRecentRemoval.timestamp).getTime() > new Date(mostRecentInsertion.timestamp).getTime()) {
                    resultMap.set(mid, { insertionTime: null, wasRemoved: true, removalTime: new Date(mostRecentRemoval.timestamp).toISOString() });
                    continue;
                  }
                } else if (mostRecentRemoval && !mostRecentInsertion) {
                  resultMap.set(mid, { insertionTime: null, wasRemoved: true, removalTime: new Date(mostRecentRemoval.timestamp).toISOString() });
                  continue;
                }

                if (mostRecentInsertion) {
                  resultMap.set(mid, { insertionTime: new Date(mostRecentInsertion.timestamp).toISOString(), wasRemoved: false, removalTime: null });
                }
              }

              return resultMap;
            } catch (err) {
              console.log(`[CARD-EVENTS-BULK] Error: ${err}`);
              return resultMap;
            }
          };

          // Backward-compatible wrapper
          const fetchCardInsertionTime = async (vehicleMid: number, afterTimestamp?: string | null): Promise<string | null> => {
            const result = await fetchCardEvents(vehicleMid, afterTimestamp);
            return result.insertionTime;
          };

          const EMPTY_CARD_VAL = "0000000000000000";
          // Collect vehicles that need event-based timestamp lookup
          const cardEventLookups: Array<{ idx: number; vehicleMid: number; plate: string; isBackfill: boolean; eventType: string; oldCardNumber: string | null; newCardNumber: string | null; existingCardInsertedAt: string | null }> = [];

          for (let idx = 0; idx < vehicleRecords.length; idx++) {
            const rec = vehicleRecords[idx];
            const existing = existingMap.get(rec.trackit_id);
            if (!existing) continue;

            // Parse card presence and card number from existing tachograph_status
            let oldCardPresent = false;
            let oldCardNumber: string | null = null;
            if (existing.tachograph_status) {
              try {
                const oldTacho = JSON.parse(existing.tachograph_status);
                // Use enriched field first, fallback to dc1
                if (oldTacho.card_present != null) {
                  oldCardPresent = !!oldTacho.card_present;
                } else {
                  const oldDc1 = oldTacho?.dc1 || null;
                  oldCardPresent = !!(oldDc1 && oldDc1 !== "" && oldDc1 !== EMPTY_CARD_VAL && oldDc1 !== "0");
                }
                oldCardNumber = oldTacho.card_slot_1 || oldTacho.dc1 || null;
                if (oldCardNumber === EMPTY_CARD_VAL || oldCardNumber === "0" || oldCardNumber === "") {
                  oldCardNumber = null;
                }
              } catch { /* ignore */ }
            }
            const oldHasCard = oldCardPresent;

            // Parse card presence and card number from new tachograph_status (enriched)
            let newCardPresent = false;
            let newCardNumber: string | null = null;
            let newDriverState1: number | null = null;
            if (rec.tachograph_status) {
              try {
                const newTacho = JSON.parse(rec.tachograph_status);
                newCardPresent = !!newTacho.card_present;
                newCardNumber = newTacho.card_slot_1 || null;
                newDriverState1 = newTacho.ds1 ?? newTacho.tacho_compliance?.driver_state ?? null;
              } catch { /* ignore */ }
            }
            const newHasCard = newCardPresent;

            if (!oldHasCard && newHasCard) {
              // Card just inserted → need event timestamp
              cardEventLookups.push({ idx, vehicleMid: parseInt(rec.trackit_id), plate: rec.plate, isBackfill: false, eventType: "inserted", oldCardNumber: null, newCardNumber, existingCardInsertedAt: null });
            } else if (oldHasCard && !newHasCard) {
              // Card removed → clear timestamp
              (rec as any).card_inserted_at = null;
              console.log(`[CARD-REMOVE] ${rec.plate}: card removed, clearing card_inserted_at`);
              // Record removal event
              cardEventLookups.push({ idx, vehicleMid: parseInt(rec.trackit_id), plate: rec.plate, isBackfill: false, eventType: "removed", oldCardNumber, newCardNumber: null, existingCardInsertedAt: null });
            } else if (newHasCard && existing.card_inserted_at) {
              // Card still inserted — but check if card NUMBER changed (different driver)
              if (oldCardNumber && newCardNumber && oldCardNumber !== newCardNumber) {
                // Different card inserted → need new event timestamp
                console.log(`[CARD-CHANGE] ${rec.plate}: card changed from ${oldCardNumber} to ${newCardNumber}, fetching new timestamp`);
                cardEventLookups.push({ idx, vehicleMid: parseInt(rec.trackit_id), plate: rec.plate, isBackfill: false, eventType: "swap", oldCardNumber, newCardNumber, existingCardInsertedAt: existing.card_inserted_at });
              } else {
                // Same card still inserted — check if session is stale
                const sessionAge = existing.card_inserted_at
                  ? Date.now() - new Date(existing.card_inserted_at).getTime()
                  : 0;
                const TWELVE_HOURS = 12 * 60 * 60 * 1000;
                const TWENTY_HOURS = 20 * 60 * 60 * 1000;
                const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

                // CARD-STALE-REST: When ds1=0 (rest) and session >12h, Trackit's dc1 field
                // is likely stale/cached. Treat as removal. If the card is truly inserted,
                // the next sync with ds1 != 0 will re-detect it.
                if (sessionAge >= TWELVE_HOURS && newDriverState1 === 0) {
                  (rec as any).card_inserted_at = null;
                  const origV = filteredVehicles[idx];
                  const staleRestTachoTs = origV?.data?.drs?.tmx || origV?.data?.pos?.tmx || null;
                  const staleRestEventAt = staleRestTachoTs ? new Date(staleRestTachoTs).toISOString() : new Date().toISOString();
                  console.log(`[CARD-STALE-REST] ${rec.plate}: ds1=0 (rest) and session ${Math.round(sessionAge / 3600000)}h old, treating dc1 as stale → forcing removal (event_at=${staleRestEventAt})`);
                  // Register removal directly — no API call needed (saves a lookup slot)
                  const staleRestExisting = existingMap.get(rec.trackit_id);
                  const staleRestVehicleDbId = staleRestExisting?.id || null;
                  const staleRestCardNum = newCardNumber;
                  const staleRestNormalized = staleRestCardNum?.replace(/[\s]/g, "").toUpperCase() || "";
                  let staleRestDriverName = cardToDriverName.get(staleRestNormalized) || null;
                  if (!staleRestDriverName) {
                    const stripped = staleRestNormalized.replace(/^0+/, "").slice(0, -2);
                    for (const [cn, name] of cardToDriverName.entries()) {
                      if (cn.replace(/^0+/, "").slice(0, -2) === stripped) { staleRestDriverName = name as string; break; }
                    }
                  }
                  // Fallback: employees table (handles country prefix)
                  let staleRestEmpNum: number | null = null;
                  if (!staleRestDriverName) {
                    const emp = cardToEmployee.get(staleRestNormalized);
                    if (emp) { staleRestDriverName = emp.full_name; staleRestEmpNum = emp.employee_number; }
                  }
                  if (!staleRestEmpNum && staleRestDriverName) {
                    staleRestEmpNum = nameToEmployeeNumber.get(staleRestDriverName.toLowerCase().trim()) || null;
                  }
                  await supabaseAdmin.from("card_events").insert({
                    vehicle_id: staleRestVehicleDbId, plate: rec.plate, card_number: staleRestCardNum, driver_name: staleRestDriverName, employee_number: staleRestEmpNum, event_type: "removed", event_at: staleRestEventAt,
                  });
                  console.log(`[CARD-EVENT] ${rec.plate}: STALE-REST removal recorded (event_at=${staleRestEventAt})`);
                } else if (sessionAge >= FORTY_EIGHT_HOURS) {
                  // Session >48h — no driver legitimately keeps a card inserted this long (EU 561)
                  // Force removal directly — API has no data this old, saves a lookup slot
                  (rec as any).card_inserted_at = null;
                  const staleClearEventAt = new Date().toISOString();
                  console.log(`[CARD-STALE-CLEAR] ${rec.plate}: session ${Math.round(sessionAge / 3600000)}h old (>48h), forcing removal (event_at=${staleClearEventAt})`);
                  const staleClearExisting = existingMap.get(rec.trackit_id);
                  const staleClearVehicleDbId = staleClearExisting?.id || null;
                  const staleClearCardNum = newCardNumber;
                  const staleClearNormalized = staleClearCardNum?.replace(/[\s]/g, "").toUpperCase() || "";
                  let staleClearDriverName = cardToDriverName.get(staleClearNormalized) || null;
                  if (!staleClearDriverName) {
                    const stripped = staleClearNormalized.replace(/^0+/, "").slice(0, -2);
                    for (const [cn, name] of cardToDriverName.entries()) {
                      if (cn.replace(/^0+/, "").slice(0, -2) === stripped) { staleClearDriverName = name as string; break; }
                    }
                  }
                  // Fallback: employees table (handles country prefix)
                  let staleClearEmpNum: number | null = null;
                  if (!staleClearDriverName) {
                    const emp = cardToEmployee.get(staleClearNormalized);
                    if (emp) { staleClearDriverName = emp.full_name; staleClearEmpNum = emp.employee_number; }
                  }
                  if (!staleClearEmpNum && staleClearDriverName) {
                    staleClearEmpNum = nameToEmployeeNumber.get(staleClearDriverName.toLowerCase().trim()) || null;
                  }
                  await supabaseAdmin.from("card_events").insert({
                    vehicle_id: staleClearVehicleDbId, plate: rec.plate, card_number: staleClearCardNum, driver_name: staleClearDriverName, employee_number: staleClearEmpNum, event_type: "removed", event_at: staleClearEventAt,
                  });
                  console.log(`[CARD-EVENT] ${rec.plate}: STALE-CLEAR removal recorded (event_at=${staleClearEventAt})`);

                } else if (sessionAge >= TWELVE_HOURS) {
                  // Session 12h-48h with ds1>0 → recheck events 45/46 for missed removal+reinsertion
                  // Detect "exact recheck" cases: LAST REAL card_event insertion from previous day but tmx from today
                  // Use card_events table (not vehicles.card_inserted_at which may have been overwritten by tmx fallback)
                  const origVRecheck = filteredVehicles[idx];
                  const tmxRecheck = origVRecheck?.data?.drs?.tmx || origVRecheck?.data?.pos?.tmx || null;
                  const todayDate = new Date().toDateString();
                  const tmxDate = tmxRecheck ? new Date(tmxRecheck).toDateString() : null;
                  
                  // Use the real last insertion from card_events, NOT from vehicles.card_inserted_at
                  const lastRealInsertion = lastRealInsertionMap.get(rec.plate);
                  const lastRealDate = lastRealInsertion?.date || null;
                  const lastRealTimestamp = lastRealInsertion?.timestamp || existing.card_inserted_at;
                  
                  const isStaleExact = lastRealDate !== null 
                    && lastRealDate !== todayDate 
                    && tmxDate === todayDate;
                  if (isStaleExact) {
                    console.log(`[CARD-RECHECK-QUEUED-EXACT] ${rec.plate}: card ${newCardNumber} inserted ${Math.round(sessionAge / 3600000)}h ago, last REAL event=${lastRealDate} (${lastRealTimestamp}), tmx is today → priority exact recheck`);
                  } else {
                    console.log(`[CARD-RECHECK] ${rec.plate}: same card ${newCardNumber} inserted ${Math.round(sessionAge / 3600000)}h ago, rechecking events`);
                  }
                  // Pass the REAL card_events timestamp as existingCardInsertedAt (not the tmx-overwritten one)
                  cardEventLookups.push({ idx, vehicleMid: parseInt(rec.trackit_id), plate: rec.plate, isBackfill: false, eventType: isStaleExact ? "recheck_exact" : "recheck", oldCardNumber: newCardNumber, newCardNumber, existingCardInsertedAt: lastRealTimestamp });
                } else {
                  // Recent session → preserve existing timestamp (no API cost)
                  (rec as any).card_inserted_at = existing.card_inserted_at;
                }
              }
            } else if (newHasCard && !existing.card_inserted_at) {
              // Backfill: use telemetry timestamp directly (no API call needed)
              const origV = filteredVehicles[idx];
              const tmx = origV?.data?.drs?.tmx || origV?.data?.pos?.tmx || null;
              const backfillTs = tmx ? new Date(tmx).toISOString() : new Date().toISOString();
              (rec as any).card_inserted_at = backfillTs;
              console.log(`[CARD-BACKFILL] ${rec.plate}: card_inserted_at=${backfillTs} (source=tmx)`);
            }
            // If no card on both sides, card_inserted_at stays null
          }

          // Cap total event lookups to prevent timeouts (max ~25 API calls per sync)
          const MAX_TOTAL_LOOKUPS = 25;
          const totalBefore = cardEventLookups.length;
          
          // Separate exact rechecks from other lookups — they use bulk API and don't count against cap
          const exactRechecks = cardEventLookups.filter(l => l.eventType === "recheck_exact");
          const otherLookups = cardEventLookups.filter(l => l.eventType !== "recheck_exact");
          
          if (otherLookups.length > MAX_TOTAL_LOOKUPS) {
            // Prioritize: inserted > swap > removed > backfill_only > recheck
            const priority: Record<string, number> = { inserted: 0, swap: 1, removed: 2, backfill_only: 3, recheck: 4 };
            otherLookups.sort((a, b) => {
              const pa = priority[a.eventType] ?? 5;
              const pb = priority[b.eventType] ?? 5;
              if (pa !== pb) return pa - pb;
              const aTime = a.existingCardInsertedAt ? new Date(a.existingCardInsertedAt).getTime() : 0;
              const bTime = b.existingCardInsertedAt ? new Date(b.existingCardInsertedAt).getTime() : 0;
              return bTime - aTime;
            });
            // Restore existing timestamps for dropped lookups
            const dropped = otherLookups.splice(MAX_TOTAL_LOOKUPS);
            for (const lookup of dropped) {
              if (lookup.eventType === "recheck") {
                const rec = vehicleRecords[lookup.idx];
                // Don't use tmx fallback — preserve existing and log pending
                console.log(`[CARD-RECHECK-PENDING-EXACT] ${rec.plate}: cap dropped recheck, preserving ${lookup.existingCardInsertedAt} (pending real event)`);
                (rec as any).card_inserted_at = lookup.existingCardInsertedAt;
              } else if (lookup.eventType === "backfill_only") {
                const rec = vehicleRecords[lookup.idx];
                (rec as any).card_inserted_at = lookup.existingCardInsertedAt;
              }
            }
            console.log(`[LOOKUP-CAP] ${totalBefore} lookups queued, capped to ${MAX_TOTAL_LOOKUPS} (dropped ${dropped.length}: ${dropped.map(d => d.eventType).join(',')}), ${exactRechecks.length} exact rechecks (bulk)`);
          } else {
            console.log(`[LOOKUP-CAP] ${otherLookups.length} lookups queued (under cap), ${exactRechecks.length} exact rechecks (bulk)`);
          }

          // Replace cardEventLookups with otherLookups for individual processing
          cardEventLookups.length = 0;
          cardEventLookups.push(...otherLookups);

          // === BULK PROCESS EXACT RECHECKS ===
          if (exactRechecks.length > 0) {
            // Find the earliest existingCardInsertedAt to use as search window start
            const earliestTs = exactRechecks.reduce((min, l) => {
              if (!l.existingCardInsertedAt) return min;
              const t = new Date(l.existingCardInsertedAt).getTime();
              return t < min ? t : min;
            }, Date.now());
            // Add 1h margin before earliest timestamp
            const bulkDateBegin = new Date(earliestTs - 60 * 60 * 1000);
            const bulkMids = exactRechecks.map(l => l.vehicleMid);

            // Single bulk API call for all exact rechecks
            const bulkResults = await fetchCardEventsBulk(bulkMids, bulkDateBegin);

            for (const lookup of exactRechecks) {
              const rec = vehicleRecords[lookup.idx];
              const bulkResult = bulkResults.get(lookup.vehicleMid);

              if (bulkResult?.wasRemoved) {
                // Card was actually removed
                console.log(`[CARD-RECHECK-HIT] ${rec.plate}: bulk detected removal at ${bulkResult.removalTime}`);
                (rec as any).card_inserted_at = null;
                if (rec.tachograph_status) {
                  try {
                    const tacho = JSON.parse(rec.tachograph_status);
                    tacho.card_present = false;
                    tacho.card_slot_1 = null;
                    rec.tachograph_status = JSON.stringify(tacho);
                  } catch { /* ignore */ }
                }
                rec.current_driver_id = null;
              } else if (bulkResult?.insertionTime) {
                // Found a re-insertion event with exact timestamp
                const afterMs = lookup.existingCardInsertedAt ? new Date(lookup.existingCardInsertedAt).getTime() : 0;
                const eventMs = new Date(bulkResult.insertionTime).getTime();
                if (eventMs > afterMs) {
                  console.log(`[CARD-RECHECK-HIT] ${rec.plate}: exact re-insertion at ${bulkResult.insertionTime} (was ${lookup.existingCardInsertedAt})`);
                  (rec as any).card_inserted_at = bulkResult.insertionTime;
                  // Record removal + re-insertion events
                  const existing = existingMap.get(rec.trackit_id);
                  const vehicleDbId = existing?.id || null;
                  const normalizedCard = lookup.newCardNumber?.replace(/[\s]/g, "").toUpperCase() || "";
                  let driverName = cardToDriverName.get(normalizedCard) || null;
                  if (!driverName) {
                    const stripped = normalizedCard.replace(/^0+/, "").slice(0, -2);
                    for (const [cn, name] of cardToDriverName.entries()) {
                      if (cn.replace(/^0+/, "").slice(0, -2) === stripped) { driverName = name as string; break; }
                    }
                  }
                  let empNum: number | null = null;
                  if (!driverName) {
                    const emp = cardToEmployee.get(normalizedCard);
                    if (emp) { driverName = emp.full_name; empNum = emp.employee_number; }
                  }
                  if (!empNum && driverName) {
                    empNum = nameToEmployeeNumber.get(driverName.toLowerCase().trim()) || null;
                  }
                  const removalTime = lookup.existingCardInsertedAt || bulkResult.insertionTime;
                  await supabaseAdmin.from("card_events").insert([
                    { vehicle_id: vehicleDbId, plate: rec.plate, card_number: lookup.newCardNumber, driver_name: driverName, employee_number: empNum, event_type: "removed", event_at: removalTime },
                    { vehicle_id: vehicleDbId, plate: rec.plate, card_number: lookup.newCardNumber, driver_name: driverName, employee_number: empNum, event_type: "inserted", event_at: bulkResult.insertionTime },
                  ]);
                  console.log(`[CARD-EVENT] ${rec.plate}: exact recheck re-insertion recorded (removed at ${removalTime}, inserted at ${bulkResult.insertionTime})`);
                } else {
                  // Event found but not newer than existing — preserve
                  console.log(`[CARD-RECHECK-PENDING-EXACT] ${rec.plate}: event found at ${bulkResult.insertionTime} but not after ${lookup.existingCardInsertedAt}, preserving`);
                  (rec as any).card_inserted_at = lookup.existingCardInsertedAt;
                }
              } else {
                // No events found — preserve existing timestamp, don't use tmx
                console.log(`[CARD-RECHECK-PENDING-EXACT] ${rec.plate}: no event 45 found via bulk, preserving ${lookup.existingCardInsertedAt} (pending real event)`);
                (rec as any).card_inserted_at = lookup.existingCardInsertedAt;
              }
            }
          }

          // Batch fetch event timestamps for vehicles that need it (max 5 concurrent)
          const EVENT_BATCH = 5;
          for (let i = 0; i < cardEventLookups.length; i += EVENT_BATCH) {
            const batch = cardEventLookups.slice(i, i + EVENT_BATCH);
            const results = await Promise.all(
              batch.map(async (lookup) => {
                const afterTs = (lookup.eventType === "swap" || lookup.eventType === "recheck") ? lookup.existingCardInsertedAt : null;
                // For rechecks, use wider search window starting from existingCardInsertedAt - 1h margin
                const customBegin = (lookup.eventType === "recheck" && lookup.existingCardInsertedAt)
                  ? new Date(new Date(lookup.existingCardInsertedAt).getTime() - 60 * 60 * 1000).toISOString()
                  : null;
                const cardEventsResult = await fetchCardEvents(lookup.vehicleMid, afterTs, customBegin);
                return { ...lookup, eventTime: cardEventsResult.insertionTime, wasRemoved: cardEventsResult.wasRemoved, removalTime: cardEventsResult.removalTime };
              })
            );

            for (const result of results) {
              const rec = vehicleRecords[result.idx];
              const origVehicle = filteredVehicles[result.idx];
              const origDrs = origVehicle?.data?.drs || {};
              const tachoTimestamp = origDrs.tmx || origVehicle?.data?.pos?.tmx || null;

              // If event 46 (removal) is more recent than event 45, treat as removal
              if (result.wasRemoved && result.eventType !== "removed") {
                console.log(`[CARD-EVENT46] ${rec.plate}: event 46 detected removal — overriding card state`);
                (rec as any).card_inserted_at = null;
                // Override tachograph_status to reflect removal
                if (rec.tachograph_status) {
                  try {
                    const tacho = JSON.parse(rec.tachograph_status);
                    tacho.card_present = false;
                    tacho.card_slot_1 = null;
                    rec.tachograph_status = JSON.stringify(tacho);
                  } catch { /* ignore */ }
                }
                rec.current_driver_id = null;
                // Change event type to removed for card_events recording
                result.eventType = "removed";
                result.oldCardNumber = result.newCardNumber;
                result.newCardNumber = null;
              }

              // Handle "recheck" — same card, session > 12h
              if (result.eventType === "recheck") {
                if (result.eventTime) {
                  // Found a newer insertion event → re-insertion detected
                  const newInsertionTime = result.eventTime;
                  console.log(`[CARD-RECHECK-HIT] ${rec.plate}: re-insertion detected at ${newInsertionTime} (was ${result.existingCardInsertedAt})`);
                  (rec as any).card_inserted_at = newInsertionTime;
                  // Record removal + re-insertion events
                  result.eventType = "recheck_hit";
                } else {
                  // No newer event found → preserve existing timestamp (don't use tmx approximation)
                  console.log(`[CARD-RECHECK-PENDING-EXACT] ${rec.plate}: no re-insertion found via individual lookup, preserving ${result.existingCardInsertedAt} (pending real event)`);
                  (rec as any).card_inserted_at = result.existingCardInsertedAt;
                  continue;
                }
              }

              // Priority for insertions: event-45 timestamp > telemetry timestamp > current time
              // Priority for removals: event-46 removalTime > telemetry timestamp > current time
              const insertionTime = result.eventTime
                || (tachoTimestamp ? new Date(tachoTimestamp).toISOString() : null)
                || new Date().toISOString();
              const removalEventAt = result.removalTime
                || (tachoTimestamp ? new Date(tachoTimestamp).toISOString() : null)
                || new Date().toISOString();

              if (result.eventType !== "removed") {
                (rec as any).card_inserted_at = insertionTime;
              }
              const source = result.eventType === "removed"
                ? (result.removalTime ? "event-46" : (tachoTimestamp ? "tmx" : "now"))
                : (result.eventTime ? "event-45" : (tachoTimestamp ? "tmx" : "now"));
              const label = result.isBackfill ? "CARD-BACKFILL" : (result.eventType === "removed" ? "CARD-REMOVE" : "CARD-INSERT");
              console.log(`[${label}] ${rec.plate}: ${result.eventType === "removed" ? `removal_at=${removalEventAt}` : `card_inserted_at=${insertionTime}`} (source=${source})`);

              // Skip card_events for backfill_only (no real state change detected)
              if (result.eventType === "backfill_only") continue;

              // === Write card_events ===
              const existing = existingMap.get(rec.trackit_id);
              const vehicleDbId = existing?.id || null;

              // Helper to resolve driver name and employee number from card number
              const resolveDriverInfo = (cardNum: string | null) => {
                if (!cardNum) return { dName: null, empNum: null };
                const normalized = cardNum.replace(/[\s]/g, "").toUpperCase();
                let dName = cardToDriverName.get(normalized) || null;
                if (!dName) {
                  // Try stripped matching on tachograph_cards
                  const stripped = normalized.replace(/^0+/, "").slice(0, -2);
                  for (const [cn, name] of cardToDriverName.entries()) {
                    if (cn.replace(/^0+/, "").slice(0, -2) === stripped) { dName = name as string; break; }
                  }
                }
                // Fallback: try employees table (handles country prefix like "5B.")
                let empNum: number | null = null;
                if (!dName) {
                  const emp = cardToEmployee.get(normalized);
                  if (emp) {
                    dName = emp.full_name;
                    empNum = emp.employee_number;
                  }
                }
                if (!empNum && dName) {
                  empNum = nameToEmployeeNumber.get(dName.toLowerCase().trim()) || null;
                }
                return { dName, empNum };
              };

              // Helper: check if a card_event already exists (prevent duplicates on backfills)
              const eventExists = async (cardNum: string | null, plate: string, eventType: string, eventAt: string): Promise<boolean> => {
                if (!cardNum) return false;
                const { data } = await supabaseAdmin
                  .from("card_events")
                  .select("id")
                  .eq("card_number", cardNum)
                  .eq("plate", plate)
                  .eq("event_type", eventType)
                  .eq("event_at", eventAt)
                  .limit(1);
                return (data && data.length > 0);
              };

              if (result.eventType === "recheck_hit") {
                // Same card re-inserted — record removal at midpoint and new insertion
                const info = resolveDriverInfo(result.newCardNumber);
                const removalTime = result.existingCardInsertedAt || insertionTime;
                const toInsert = [];
                if (!(await eventExists(result.newCardNumber, rec.plate, "removed", removalTime))) {
                  toInsert.push({ vehicle_id: vehicleDbId, plate: rec.plate, card_number: result.newCardNumber, driver_name: info.dName, employee_number: info.empNum, event_type: "removed", event_at: removalTime });
                }
                if (!(await eventExists(result.newCardNumber, rec.plate, "inserted", insertionTime))) {
                  toInsert.push({ vehicle_id: vehicleDbId, plate: rec.plate, card_number: result.newCardNumber, driver_name: info.dName, employee_number: info.empNum, event_type: "inserted", event_at: insertionTime });
                }
                if (toInsert.length > 0) {
                  await supabaseAdmin.from("card_events").insert(toInsert);
                  console.log(`[CARD-EVENT] ${rec.plate}: recheck re-insertion recorded (removed at ${removalTime}, inserted at ${insertionTime})`);
                }
              } else if (result.eventType === "swap") {
                const oldInfo = resolveDriverInfo(result.oldCardNumber);
                const newInfo = resolveDriverInfo(result.newCardNumber);
                const oldExists = await eventExists(result.oldCardNumber, rec.plate, "removed", insertionTime);
                const newExists = await eventExists(result.newCardNumber, rec.plate, "inserted", insertionTime);
                const toInsert = [];
                if (!oldExists) toInsert.push({ vehicle_id: vehicleDbId, plate: rec.plate, card_number: result.oldCardNumber, driver_name: oldInfo.dName, employee_number: oldInfo.empNum, event_type: "removed", event_at: insertionTime });
                if (!newExists) toInsert.push({ vehicle_id: vehicleDbId, plate: rec.plate, card_number: result.newCardNumber, driver_name: newInfo.dName, employee_number: newInfo.empNum, event_type: "inserted", event_at: insertionTime });
                if (toInsert.length > 0) {
                  await supabaseAdmin.from("card_events").insert(toInsert);
                  console.log(`[CARD-EVENT] ${rec.plate}: swap recorded (removed ${result.oldCardNumber}, inserted ${result.newCardNumber})`);
                }
              } else if (result.eventType === "removed") {
                const info = resolveDriverInfo(result.oldCardNumber);
                if (!(await eventExists(result.oldCardNumber, rec.plate, "removed", removalEventAt))) {
                  await supabaseAdmin.from("card_events").insert({
                    vehicle_id: vehicleDbId, plate: rec.plate, card_number: result.oldCardNumber, driver_name: info.dName, employee_number: info.empNum, event_type: "removed", event_at: removalEventAt,
                  });
                  console.log(`[CARD-EVENT] ${rec.plate}: removal recorded (event_at=${removalEventAt}, source=${source})`);
                }
              } else {
                // inserted (or backfill)
                const info = resolveDriverInfo(result.newCardNumber);
                if (!(await eventExists(result.newCardNumber, rec.plate, "inserted", insertionTime))) {
                  // Auto-remove from other vehicles: if this card is currently inserted elsewhere, generate removal
                  if (result.newCardNumber) {
                    const { data: openSessions } = await supabaseAdmin
                      .from("card_events")
                      .select("id, plate, event_at")
                      .eq("card_number", result.newCardNumber)
                      .eq("event_type", "inserted")
                      .neq("plate", rec.plate)
                      .order("event_at", { ascending: false })
                      .limit(1);
                    if (openSessions && openSessions.length > 0) {
                      const prevPlate = openSessions[0].plate;
                      // Check there's no removal yet for this card on the previous plate after the insertion
                      const { data: existingRemoval } = await supabaseAdmin
                        .from("card_events")
                        .select("id")
                        .eq("card_number", result.newCardNumber)
                        .eq("plate", prevPlate)
                        .eq("event_type", "removed")
                        .gt("event_at", openSessions[0].event_at)
                        .limit(1);
                      if (!existingRemoval || existingRemoval.length === 0) {
                        const prevVehicle = existingMap.get(vehicleRecords.find((vr: any) => vr.plate === prevPlate)?.trackit_id);
                        await supabaseAdmin.from("card_events").insert({
                          vehicle_id: prevVehicle?.id || null, plate: prevPlate, card_number: result.newCardNumber, driver_name: info.dName, employee_number: info.empNum, event_type: "removed", event_at: insertionTime,
                        });
                        console.log(`[CARD-EVENT] ${prevPlate}: auto-removal recorded (card moved to ${rec.plate})`);
                      }
                    }
                  }
                  await supabaseAdmin.from("card_events").insert({
                    vehicle_id: vehicleDbId, plate: rec.plate, card_number: result.newCardNumber, driver_name: info.dName, employee_number: info.empNum, event_type: "inserted", event_at: insertionTime,
                  });
                  console.log(`[CARD-EVENT] ${rec.plate}: insertion recorded`);
                } else {
                  console.log(`[CARD-EVENT] ${rec.plate}: skipped duplicate insertion`);
                }
              }
            }
          }

          // Upsert vehicles
          const { error: upsertError } = await supabaseAdmin
            .from("vehicles")
            .upsert(vehicleRecords, { onConflict: "trackit_id" });

          // === STALE CARD SESSION CLEANUP ===
          // If card_inserted_at > 48h AND ds1=0 AND speed=0, auto-clear as stale
          const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;
          const nowMs = Date.now();
          
          for (const v of filteredVehicles) {
            const d = v.data || {};
            const drs = d.drs || {};
            const ds1 = drs.ds1 ?? d.exd?.eco?.ds1 ?? null;
            const plate = (v.info?.plate || v.plate || v.name || "").replace(/[\s]/g, "").toUpperCase();
            const vRec = vehicleRecords.find((r: any) => r.plate === plate);
            if (!vRec) continue;
            
            const existing = existingMap.get(vRec.trackit_id);
            if (!existing?.card_inserted_at) continue;
            
            const insertedMs = new Date(existing.card_inserted_at).getTime();
            const ageMs = nowMs - insertedMs;
            const speed = vRec.last_speed ?? 0;
            
            if (ageMs > STALE_THRESHOLD_MS && ds1 === 0 && speed === 0) {
              console.log(`[CARD-STALE] ${plate}: card_inserted_at=${existing.card_inserted_at} is ${Math.round(ageMs / 3600000)}h old, ds1=0, speed=0 → auto-clearing`);
              
              // Clear card_inserted_at on the vehicle
              await supabaseAdmin
                .from("vehicles")
                .update({ card_inserted_at: null, current_driver_id: null })
                .eq("id", existing.id);
              
              // Parse the old card number for the removal event
              let staleCardNumber: string | null = null;
              let stalDriverName: string | null = null;
              let stalEmpNum: number | null = null;
              if (existing.tachograph_status) {
                try {
                  const oldTacho = JSON.parse(existing.tachograph_status);
                  staleCardNumber = oldTacho.card_slot_1 || oldTacho.dc1 || null;
                  if (staleCardNumber) {
                    const normalized = staleCardNumber.replace(/[\s]/g, "").toUpperCase();
                    stalDriverName = cardToDriverName.get(normalized) as string || null;
                    if (!stalDriverName) {
                      const stripped = normalized.replace(/^0+/, "").slice(0, -2);
                      for (const [cn, name] of cardToDriverName.entries()) {
                        if (cn.replace(/^0+/, "").slice(0, -2) === stripped) { stalDriverName = name as string; break; }
                      }
                    }
                    stalEmpNum = stalDriverName ? (nameToEmployeeNumber.get(stalDriverName.toLowerCase().trim()) as number || null) : null;
                  }
                } catch { /* ignore */ }
              }
              
              // Create auto-removal event
              const removalTime = new Date().toISOString();
              await supabaseAdmin.from("card_events").insert({
                vehicle_id: existing.id,
                plate,
                card_number: staleCardNumber,
                driver_name: stalDriverName,
                employee_number: stalEmpNum,
                event_type: "removed",
                event_at: removalTime,
              });
              console.log(`[CARD-STALE] ${plate}: auto-removal event created (stale >48h)`);
            }
          }

          // === DRIVER ACTIVITY TRACKING (EU 561/2006) ===
          // Extract current tachograph state for each vehicle and upsert driver_activities
          const activityMap: Record<string, string> = {
            "0": "rest", "1": "available", "2": "work", "3": "driving",
          };
          const nowISO = new Date().toISOString();

          // === CLOSE ORPHAN SESSIONS ===
          // When a driver's card is removed (current_driver_id becomes null),
          // close any open activities for drivers that were previously assigned
          const driversWithOpenSessions = new Set<string>();
          const currentlyAssignedDrivers = new Set(
            vehicleRecords.filter((r: any) => r.current_driver_id).map((r: any) => r.current_driver_id)
          );

          // Find all open activities for drivers linked to vehicles in this sync
          const allPlates = vehicleRecords.map((r: any) => r.plate);
          const { data: vehicleIds } = await supabaseAdmin
            .from("vehicles")
            .select("id, current_driver_id")
            .in("plate", allPlates);

          // Get previously assigned drivers (those with open activities on these vehicles)
          const vehicleIdList = (vehicleIds || []).map((v: any) => v.id).filter(Boolean);
          if (vehicleIdList.length > 0) {
            const { data: orphanActivities } = await supabaseAdmin
              .from("driver_activities")
              .select("id, driver_id, start_time, vehicle_id")
              .in("vehicle_id", vehicleIdList)
              .is("end_time", null);

            for (const oa of orphanActivities || []) {
              if (!currentlyAssignedDrivers.has(oa.driver_id)) {
                // This driver is no longer assigned — close their session
                const startTime = new Date(oa.start_time);
                const durationMin = Math.round((Date.now() - startTime.getTime()) / 60000);
                await supabaseAdmin
                  .from("driver_activities")
                  .update({ end_time: nowISO, duration_minutes: durationMin })
                  .eq("id", oa.id);
                console.log(`Closed orphan activity for driver ${oa.driver_id} (card removed)`);
              }
            }
          }

          for (const v of filteredVehicles) {
            const d = v.data || {};
            const drs = d.drs || {};
            const ds1 = drs.ds1 ?? d.exd?.eco?.ds1 ?? null;
            const plate = (v.info?.plate || v.plate || v.name || "").replace(/[\s]/g, "").toUpperCase();
            const vRec = vehicleRecords.find((r: any) => r.plate === plate);
            if (!vRec || !vRec.current_driver_id || ds1 == null) continue;

            const activityType = activityMap[String(ds1)] || "unknown";
            const driverId = vRec.current_driver_id;

            // Get vehicle ID from DB
            const { data: vDb } = await supabaseAdmin
              .from("vehicles")
              .select("id")
              .eq("plate", plate)
              .limit(1)
              .maybeSingle();
            const vehicleId = vDb?.id || null;

            // Check if there's an open activity of the same type for this driver
            const { data: openActivity } = await supabaseAdmin
              .from("driver_activities")
              .select("id, activity_type, start_time")
              .eq("driver_id", driverId)
              .is("end_time", null)
              .order("start_time", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (openActivity) {
              if (openActivity.activity_type === activityType) {
                // Same activity, update duration
                const startTime = new Date(openActivity.start_time);
                const durationMin = Math.round((Date.now() - startTime.getTime()) / 60000);
                await supabaseAdmin
                  .from("driver_activities")
                  .update({ duration_minutes: durationMin })
                  .eq("id", openActivity.id);
              } else {
                // Activity changed — close the old one, open new
                const startTime = new Date(openActivity.start_time);
                const durationMin = Math.round((Date.now() - startTime.getTime()) / 60000);
                await supabaseAdmin
                  .from("driver_activities")
                  .update({ end_time: nowISO, duration_minutes: durationMin })
                  .eq("id", openActivity.id);

                // Insert new activity
                await supabaseAdmin.from("driver_activities").insert({
                  driver_id: driverId,
                  vehicle_id: vehicleId,
                  activity_type: activityType,
                  start_time: nowISO,
                  source: "trackit",
                });
              }
            } else {
              // No open activity — create one
              await supabaseAdmin.from("driver_activities").insert({
                driver_id: driverId,
                vehicle_id: vehicleId,
                activity_type: activityType,
                start_time: nowISO,
                source: "trackit",
              });
            }
          }

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

          // === DRIVING WITHOUT CARD DETECTION ===
          // If speed > 5 and card_present === false → create compliance_violation
          const drivingWithoutCardAlerts: Array<{
            vehicle_id: string;
            plate: string;
            speed: number;
            lat: number | null;
            lng: number | null;
            location: string | null;
          }> = [];

          for (const rec of vehicleRecords) {
            const existing = existingMap.get(rec.trackit_id);
            if (!existing) continue;
            const speed = rec.last_speed ?? 0;
            if (speed <= 5) continue;

            // Check card_present from tachograph_status
            let cardPresent = true;
            if (rec.tachograph_status) {
              try {
                const tacho = JSON.parse(rec.tachograph_status);
                cardPresent = !!tacho.card_present;
              } catch { /* ignore */ }
            }
            if (cardPresent) continue;

            drivingWithoutCardAlerts.push({
              vehicle_id: existing.id,
              plate: rec.plate,
              speed,
              lat: rec.last_lat,
              lng: rec.last_lng,
              location: rec.last_location_name,
            });
          }

          // Deduplicate: only create violation if none exists for this vehicle in last 4h
          const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
          const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
          for (const alert of drivingWithoutCardAlerts) {
            const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
            const { data: recentViolation } = await supabaseAdmin
              .from("compliance_violations")
              .select("id")
              .eq("violation_type", "driving_without_card")
              .gte("detected_at", fourHoursAgo)
              .limit(100);

            // Check if any recent violation matches this vehicle (details->plate)
            let alreadyExists = false;
            if (recentViolation && recentViolation.length > 0) {
              // Query with details filter
              const { data: matchingViolation } = await supabaseAdmin
                .from("compliance_violations")
                .select("id")
                .eq("violation_type", "driving_without_card")
                .gte("detected_at", fourHoursAgo)
                .contains("details", { plate: alert.plate })
                .limit(1);
              alreadyExists = !!(matchingViolation && matchingViolation.length > 0);
            }

            if (!alreadyExists) {
              // Use a placeholder driver_id since the column is NOT NULL
              // Use the vehicle's current_driver_id if available, otherwise use a system UUID
              const driverId = vehicleRecords.find((r: any) => r.plate === alert.plate)?.current_driver_id
                || "00000000-0000-0000-0000-000000000000";

              const { error: violationErr } = await supabaseAdmin
                .from("compliance_violations")
                .insert({
                  driver_id: driverId,
                  violation_type: "driving_without_card",
                  severity: "critical",
                  details: {
                    plate: alert.plate,
                    speed: alert.speed,
                    lat: alert.lat,
                    lng: alert.lng,
                    location: alert.location,
                    detected_at: new Date().toISOString(),
                  },
                });

              if (violationErr) {
                console.error(`[NO-CARD-ALERT] Error creating violation for ${alert.plate}:`, violationErr.message);
              } else {
                console.log(`[NO-CARD-ALERT] ⚠️ ${alert.plate} em movimento a ${alert.speed} km/h sem cartão de tacógrafo!`);

                // Send push notification to admins
                try {
                  const { data: adminRoles } = await supabaseAdmin
                    .from("user_roles")
                    .select("user_id")
                    .in("role", ["admin", "manager"]);

                  const adminIds = (adminRoles || []).map((r: any) => r.user_id);
                  if (adminIds.length > 0) {
                    await fetch(`${SUPABASE_URL}/functions/v1/send-fcm`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "apikey": SUPABASE_ANON_KEY,
                      },
                      body: JSON.stringify({
                        user_ids: adminIds,
                        title: "⚠️ Condução sem cartão",
                        body: `${alert.plate} em movimento a ${alert.speed} km/h sem cartão de tacógrafo${alert.location ? ` (${alert.location})` : ""}`,
                        data: { route: "/admin/compliance" },
                      }),
                    });
                    console.log(`[NO-CARD-ALERT] Push notification sent to ${adminIds.length} admin(s)`);
                  }
                } catch (pushErr) {
                  console.error(`[NO-CARD-ALERT] Push notification error:`, pushErr);
                }
              }
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

          // === UPDATE gap_end_date ON DRAFT DECLARATIONS ===
          // Use gap_start_date as stable anchor to find the FIRST return signal.
          // Priority: 1) card_events(inserted) after gap_start, 2) driver_activities after gap_start.
          // Monotonic rule: only update if candidate is EARLIER than current gap_end_date.
          const driversWithNewActivity = new Set(
            vehicleRecords
              .filter((r: any) => r.current_driver_id)
              .map((r: any) => r.current_driver_id)
          );

          if (driversWithNewActivity.size > 0) {
            const driverIdsArray = Array.from(driversWithNewActivity);
            const { data: draftDeclarations } = await supabaseAdmin
              .from("activity_declarations")
              .select("id, driver_id, gap_start_date, gap_end_date")
              .in("driver_id", driverIdsArray)
              .eq("status", "draft");

            for (const decl of draftDeclarations || []) {
              const anchor = decl.gap_start_date;
              let candidateGapEnd: string | null = null;

              // Priority 1: first card_events "inserted" after gap_start_date
              // We need the employee_number for this driver to match card_events
              const { data: empMatch } = await supabaseAdmin
                .from("employees")
                .select("employee_number")
                .eq("profile_id", decl.driver_id)
                .limit(1)
                .maybeSingle();

              if (empMatch?.employee_number) {
                const { data: cardInsertEvent } = await supabaseAdmin
                  .from("card_events")
                  .select("event_at")
                  .eq("employee_number", empMatch.employee_number)
                  .eq("event_type", "inserted")
                  .gt("event_at", anchor)
                  .order("event_at", { ascending: true })
                  .limit(1)
                  .maybeSingle();

                if (cardInsertEvent?.event_at) {
                  candidateGapEnd = cardInsertEvent.event_at;
                  console.log(`[SYNC] Declaration ${decl.id}: card_events candidate = ${candidateGapEnd}`);
                }
              }

              // Priority 2 (fallback): first driver_activity after gap_start_date
              if (!candidateGapEnd) {
                const { data: firstReturnActivity } = await supabaseAdmin
                  .from("driver_activities")
                  .select("start_time")
                  .eq("driver_id", decl.driver_id)
                  .gt("start_time", anchor)
                  .order("start_time", { ascending: true })
                  .limit(1)
                  .maybeSingle();

                if (firstReturnActivity?.start_time) {
                  candidateGapEnd = firstReturnActivity.start_time;
                  console.log(`[SYNC] Declaration ${decl.id}: driver_activities candidate = ${candidateGapEnd}`);
                }
              }

              // Monotonic rule: only update if candidate is earlier than current, or current is empty
              if (candidateGapEnd) {
                const candidateMs = new Date(candidateGapEnd).getTime();
                const currentMs = decl.gap_end_date ? new Date(decl.gap_end_date).getTime() : Infinity;

                if (candidateMs < currentMs) {
                  const { error: updateDeclErr } = await supabaseAdmin
                    .from("activity_declarations")
                    .update({ gap_end_date: candidateGapEnd })
                    .eq("id", decl.id);

                  if (updateDeclErr) {
                    console.error(`[SYNC] Error updating gap_end_date for declaration ${decl.id}:`, updateDeclErr.message);
                  } else {
                    console.log(`[SYNC] Updated gap_end_date for declaration ${decl.id}: ${decl.gap_end_date} → ${candidateGapEnd}`);
                  }
                } else {
                  console.log(`[SYNC] Skipped declaration ${decl.id}: candidate ${candidateGapEnd} >= current ${decl.gap_end_date}`);
                }
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
