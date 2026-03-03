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
        // Helper: fetch with retry for unreliable endpoints
        const fetchWithRetry = async (url: string, opts: RequestInit, timeoutMs: number, retries = 1): Promise<Response | null> => {
          for (let attempt = 0; attempt <= retries; attempt++) {
            try {
              const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
              if (res.ok) return res;
              console.warn(`[DRIVERLIST] ${client.name}: attempt ${attempt + 1}: HTTP ${res.status}`);
            } catch (e: any) {
              console.warn(`[DRIVERLIST] ${client.name}: attempt ${attempt + 1} failed: ${e.message || e}`);
            }
            if (attempt < retries) {
              console.log(`[DRIVERLIST] ${client.name}: retrying in 2s...`);
              await new Promise(r => setTimeout(r, 2000));
            }
          }
          return null;
        };

        // Fire driverList in background — don't block vehicle processing
        const driverListPromise = fetchWithRetry(
          "https://i.trackit.pt/ws/driverList",
          { headers: { Authorization: `Basic ${credentials}` } },
          50000, // 50s timeout — non-blocking so can be long
          0      // No retry — single attempt
        ).then(async (res) => {
          if (!res || !res.ok) {
            if (res) console.warn(`[DRIVERLIST] ${client.name}: HTTP ${res.status}`);
            return [];
          }
          const json = await res.json();
          const data = json.data || json || [];
          console.log(`[DRIVERLIST] ${client.name}: fetched ${data.length} drivers`);
          return data;
        }).catch((e: any) => {
          console.warn(`[DRIVERLIST] ${client.name}: background fetch failed: ${e.message || e}`);
          return [] as any[];
        });

        // Fetch vehicles (fast path, ~2-5s)
        const trackitResponse = await fetch("https://i.trackit.pt/ws/vehiclesForUser", {
          method: "GET",
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/json",
          },
        });

        // driverListData will be populated after vehicle processing
        let driverListData: any[] = [];

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

          // Pre-fetch employees for employee_number lookup by name
          const { data: employeesData } = await supabaseAdmin
            .from("employees")
            .select("full_name, employee_number");
          const nameToEmployeeNumber = new Map(
            (employeesData || []).map((e: any) => [e.full_name?.toLowerCase()?.trim(), e.employee_number])
          );

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
                const enriched = {
                  ...drs,
                  card_slot_1: hasValidCard ? driverCardNumber : null,
                  card_present: !!hasValidCard,
                  card_source: cardSource,
                };
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
          const fetchCardEvents = async (vehicleMid: number, afterTimestamp?: string | null): Promise<{ insertionTime: string | null; wasRemoved: boolean }> => {
            try {
              const now = new Date();
              const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
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
                  dateBegin: fmt(yesterday),
                  dateEnd: fmt(now),
                }),
              });

              if (!eventsRes.ok) {
                console.log(`[CARD-EVENTS] Failed to fetch events for mid=${vehicleMid}: HTTP ${eventsRes.status}`);
                await eventsRes.text();
                return { insertionTime: null, wasRemoved: false };
              }

              const eventsJson = await eventsRes.json();
              if (eventsJson.error) {
                console.log(`[CARD-EVENTS] API error for mid=${vehicleMid}: ${eventsJson.message}`);
                return { insertionTime: null, wasRemoved: false };
              }

              const allEvents = eventsJson.data || [];
              if (allEvents.length === 0) {
                console.log(`[CARD-EVENTS] No events 45/46 found for mid=${vehicleMid} in last 24h`);
                return { insertionTime: null, wasRemoved: false };
              }

              // Separate insertion (45) and removal (46) events
              const insertions = allEvents.filter((e: any) => e.eventType === 45 || e.eventId === 45);
              const removals = allEvents.filter((e: any) => e.eventType === 46 || e.eventId === 46);

              console.log(`[CARD-EVENTS] mid=${vehicleMid}: ${insertions.length} insertions, ${removals.length} removals in last 24h`);

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
                  return { insertionTime: null, wasRemoved: true };
                }
              } else if (mostRecentRemoval && !mostRecentInsertion) {
                console.log(`[CARD-EVENTS] mid=${vehicleMid}: only removal found (${mostRecentRemoval.timestamp}), no insertion`);
                return { insertionTime: null, wasRemoved: true };
              }

              // Process insertion events (original logic)
              if (insertions.length === 0) {
                return { insertionTime: null, wasRemoved: false };
              }

              const afterMs = afterTimestamp ? new Date(afterTimestamp).getTime() : 0;
              const activeEvents = insertions
                .filter((e: any) => e.eventStatus === 1 && (!afterTimestamp || new Date(e.timestamp).getTime() > afterMs))
                .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

              const mostRecent = activeEvents[0] || (afterTimestamp ? null : insertions[insertions.length - 1]);
              if (!mostRecent) {
                console.log(`[CARD-EVENTS] No event 45 found for mid=${vehicleMid} after ${afterTimestamp}`);
                return { insertionTime: null, wasRemoved: false };
              }
              const eventTimestamp = mostRecent.timestamp;
              console.log(`[CARD-EVENTS] Found event 45 for mid=${vehicleMid}: timestamp=${eventTimestamp}, total=${insertions.length}${afterTimestamp ? `, filtered after=${afterTimestamp}` : ""}`);
              return { insertionTime: eventTimestamp ? new Date(eventTimestamp).toISOString() : null, wasRemoved: false };
            } catch (err) {
              console.log(`[CARD-EVENTS] Error fetching events for mid=${vehicleMid}: ${err}`);
              return { insertionTime: null, wasRemoved: false };
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
            if (rec.tachograph_status) {
              try {
                const newTacho = JSON.parse(rec.tachograph_status);
                newCardPresent = !!newTacho.card_present;
                newCardNumber = newTacho.card_slot_1 || null;
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
                const TWENTY_HOURS = 20 * 60 * 60 * 1000;
                const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
                if (sessionAge >= SEVEN_DAYS) {
                  // Ancient session (>7 days) — auto-clear without API call
                  // Trackit events API only returns last 24h, so querying is pointless
                  (rec as any).card_inserted_at = null;
                  console.log(`[CARD-STALE-CLEAR] ${rec.plate}: session ${Math.round(sessionAge / 3600000)}h old, auto-clearing card_inserted_at`);
                } else if (sessionAge >= TWENTY_HOURS) {
                  // Session 20h-7d → recheck events 45/46 for re-insertion
                  console.log(`[CARD-RECHECK] ${rec.plate}: same card ${newCardNumber} inserted ${Math.round(sessionAge / 3600000)}h ago, rechecking events`);
                  cardEventLookups.push({ idx, vehicleMid: parseInt(rec.trackit_id), plate: rec.plate, isBackfill: false, eventType: "recheck", oldCardNumber: newCardNumber, newCardNumber, existingCardInsertedAt: existing.card_inserted_at });
                } else {
                  // Recent session → preserve existing timestamp (no API cost)
                  (rec as any).card_inserted_at = existing.card_inserted_at;
                }
              }
            } else if (newHasCard && !existing.card_inserted_at) {
              // Card present but no timestamp recorded yet (backfill) → update vehicle timestamp only, do NOT create card_event
              cardEventLookups.push({ idx, vehicleMid: parseInt(rec.trackit_id), plate: rec.plate, isBackfill: true, eventType: "backfill_only", oldCardNumber: null, newCardNumber, existingCardInsertedAt: null });
            }
            // If no card on both sides, card_inserted_at stays null
          }

          // Cap total event lookups to prevent timeouts (max ~25 API calls per sync)
          const MAX_TOTAL_LOOKUPS = 10;
          const totalBefore = cardEventLookups.length;
          
          if (totalBefore > MAX_TOTAL_LOOKUPS) {
            // Prioritize: inserted > swap > removed > backfill_only > recheck
            const priority: Record<string, number> = { inserted: 0, swap: 1, removed: 2, backfill_only: 3, recheck: 4 };
            cardEventLookups.sort((a, b) => {
              const pa = priority[a.eventType] ?? 5;
              const pb = priority[b.eventType] ?? 5;
              if (pa !== pb) return pa - pb;
              // Within same type, newest sessions first (most likely to have real events)
              const aTime = a.existingCardInsertedAt ? new Date(a.existingCardInsertedAt).getTime() : 0;
              const bTime = b.existingCardInsertedAt ? new Date(b.existingCardInsertedAt).getTime() : 0;
              return bTime - aTime;
            });
            // Restore existing timestamps for dropped lookups
            const dropped = cardEventLookups.splice(MAX_TOTAL_LOOKUPS);
            for (const lookup of dropped) {
              if (lookup.eventType === "recheck" || lookup.eventType === "backfill_only") {
                const rec = vehicleRecords[lookup.idx];
                (rec as any).card_inserted_at = lookup.existingCardInsertedAt;
              }
            }
            console.log(`[LOOKUP-CAP] ${totalBefore} lookups queued, capped to ${MAX_TOTAL_LOOKUPS} (dropped ${dropped.length}: ${dropped.map(d => d.eventType).join(',')})`);
          } else {
            console.log(`[LOOKUP-CAP] ${totalBefore} lookups queued (under cap)`);
          }

          // Batch fetch event timestamps for vehicles that need it (max 5 concurrent)
          const EVENT_BATCH = 5;
          for (let i = 0; i < cardEventLookups.length; i += EVENT_BATCH) {
            const batch = cardEventLookups.slice(i, i + EVENT_BATCH);
            const results = await Promise.all(
              batch.map(async (lookup) => {
                const afterTs = (lookup.eventType === "swap" || lookup.eventType === "recheck") ? lookup.existingCardInsertedAt : null;
                const cardEventsResult = await fetchCardEvents(lookup.vehicleMid, afterTs);
                return { ...lookup, eventTime: cardEventsResult.insertionTime, wasRemoved: cardEventsResult.wasRemoved };
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
                  // No newer event found → preserve existing timestamp, skip event creation
                  console.log(`[CARD-RECHECK-MISS] ${rec.plate}: no re-insertion found, preserving ${result.existingCardInsertedAt}`);
                  (rec as any).card_inserted_at = result.existingCardInsertedAt;
                  continue;
                }
              }

              // Priority: event timestamp > telemetry timestamp > current time
              const insertionTime = result.eventTime
                || (tachoTimestamp ? new Date(tachoTimestamp).toISOString() : null)
                || new Date().toISOString();

              if (result.eventType !== "removed") {
                (rec as any).card_inserted_at = insertionTime;
              }
              const source = result.eventTime ? "event-45" : (tachoTimestamp ? "tmx" : "now");
              const label = result.isBackfill ? "CARD-BACKFILL" : "CARD-INSERT";
              console.log(`[${label}] ${rec.plate}: card_inserted_at=${insertionTime} (source=${source})`);

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
                  // Try stripped matching
                  const stripped = normalized.replace(/^0+/, "").slice(0, -2);
                  for (const [cn, name] of cardToDriverName.entries()) {
                    if (cn.replace(/^0+/, "").slice(0, -2) === stripped) { dName = name as string; break; }
                  }
                }
                const empNum = dName ? (nameToEmployeeNumber.get(dName.toLowerCase().trim()) || null) : null;
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
                if (!(await eventExists(result.oldCardNumber, rec.plate, "removed", insertionTime))) {
                  await supabaseAdmin.from("card_events").insert({
                    vehicle_id: vehicleDbId, plate: rec.plate, card_number: result.oldCardNumber, driver_name: info.dName, employee_number: info.empNum, event_type: "removed", event_at: insertionTime,
                  });
                  console.log(`[CARD-EVENT] ${rec.plate}: removal recorded`);
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

            // Wait for driverList — give it 10s grace after vehicle processing completes
            driverListData = await Promise.race([
              driverListPromise,
              new Promise<any[]>(r => setTimeout(() => r([]), 10000))
            ]);
            console.log(`[DRIVERLIST] ${client.name}: resolved with ${driverListData.length} drivers after vehicle upserts`);

            // === Process driverList data ===
            // FIX: Use vehicleRecords (mapped data with trackit_id) instead of vehiclesData (raw API)
            if (driverListData.length > 0) {
              let matchCount = 0;
              for (const drv of driverListData) {
                const td = drv.tacho_data;
                if (!td || !td.current_mobile || !td.is_auth) continue;
                
                // Match using vehicleRecords which has trackit_id and tachograph_status
                const matchingRecord = vehicleRecords.find((r: any) => 
                  parseInt(r.trackit_id) === td.current_mobile
                );
                if (!matchingRecord) continue;

                // Parse the tachograph_status we already built during vehicle mapping
                let existingStatus: any = {};
                try { existingStatus = JSON.parse(matchingRecord.tachograph_status || "{}"); } catch { /* ok */ }
                
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

                const { error: complianceErr } = await supabaseAdmin
                  .from("vehicles")
                  .update({ tachograph_status: JSON.stringify(existingStatus) })
                  .eq("trackit_id", String(td.current_mobile));
                if (complianceErr) {
                  console.warn(`[DRIVERLIST-MATCH] ${client.name}: error updating ${matchingRecord.plate}: ${complianceErr.message}`);
                } else {
                  matchCount++;
                }
              }
              console.log(`[DRIVERLIST-MATCH] ${client.name}: ${matchCount} vehicles updated with tacho compliance`);
            }
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
