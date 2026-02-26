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
            const hasValidCard = driverCardNumber
              && driverCardNumber !== ""
              && driverCardNumber !== EMPTY_CARD
              && driverCardNumber !== "0";

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

          // Detect refueling events & card insertion changes
          const trackitIds = vehicleRecords.map((r: any) => r.trackit_id);
          const { data: existingVehicles } = await supabaseAdmin
            .from("vehicles")
            .select("id, trackit_id, fuel_level_percent, tachograph_status, card_inserted_at")
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

          // === CARD INSERTION TRACKING ===
          // Detect card state changes and set card_inserted_at accordingly.
          // For new insertions and backfills, query the Trackit /ws/events endpoint
          // for event 45 (Driver Card Inserted Slot 1) to get the real insertion time.
          // Falls back to drs.tmx if events are unavailable.

          // Helper: fetch the most recent card insertion event timestamp for a vehicle
          const fetchCardInsertionTime = async (vehicleMid: number): Promise<string | null> => {
            try {
              // Query last 24h of events for this vehicle, event 45 = card inserted slot 1
              const now = new Date();
              const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
              const fmt = (d: Date) => d.toISOString().replace("T", " ").substring(0, 19);

              const eventsRes = await fetch("https://i.trackit.pt/ws/events", {
                method: "POST",
                headers: {
                  Authorization: `Basic ${credentials}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  vehicles: [vehicleMid],
                  events: [45],
                  dateBegin: fmt(yesterday),
                  dateEnd: fmt(now),
                }),
              });

              if (!eventsRes.ok) {
                console.log(`[CARD-EVENTS] Failed to fetch events for mid=${vehicleMid}: HTTP ${eventsRes.status}`);
                await eventsRes.text(); // consume body
                return null;
              }

              const eventsJson = await eventsRes.json();
              if (eventsJson.error) {
                console.log(`[CARD-EVENTS] API error for mid=${vehicleMid}: ${eventsJson.message}`);
                return null;
              }

              const events = eventsJson.data || [];
              if (events.length === 0) {
                console.log(`[CARD-EVENTS] No event 45 found for mid=${vehicleMid} in last 24h`);
                return null;
              }

              // Get the most recent event 45 (card inserted) — eventStatus=1 means active
              const activeEvents = events
                .filter((e: any) => e.eventStatus === 1)
                .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

              const mostRecent = activeEvents[0] || events[events.length - 1];
              const eventTimestamp = mostRecent.timestamp;
              console.log(`[CARD-EVENTS] Found event 45 for mid=${vehicleMid}: timestamp=${eventTimestamp}, total=${events.length}`);
              return eventTimestamp ? new Date(eventTimestamp).toISOString() : null;
            } catch (err) {
              console.log(`[CARD-EVENTS] Error fetching events for mid=${vehicleMid}: ${err}`);
              return null;
            }
          };

          const EMPTY_CARD_VAL = "0000000000000000";
          // Collect vehicles that need event-based timestamp lookup
          const cardEventLookups: Array<{ idx: number; vehicleMid: number; plate: string; isBackfill: boolean; eventType: string; oldCardNumber: string | null; newCardNumber: string | null }> = [];

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
              cardEventLookups.push({ idx, vehicleMid: parseInt(rec.trackit_id), plate: rec.plate, isBackfill: false, eventType: "inserted", oldCardNumber: null, newCardNumber });
            } else if (oldHasCard && !newHasCard) {
              // Card removed → clear timestamp
              (rec as any).card_inserted_at = null;
              console.log(`[CARD-REMOVE] ${rec.plate}: card removed, clearing card_inserted_at`);
              // Record removal event
              cardEventLookups.push({ idx, vehicleMid: parseInt(rec.trackit_id), plate: rec.plate, isBackfill: false, eventType: "removed", oldCardNumber, newCardNumber: null });
            } else if (newHasCard && existing.card_inserted_at) {
              // Card still inserted — but check if card NUMBER changed (different driver)
              if (oldCardNumber && newCardNumber && oldCardNumber !== newCardNumber) {
                // Different card inserted → need new event timestamp
                console.log(`[CARD-CHANGE] ${rec.plate}: card changed from ${oldCardNumber} to ${newCardNumber}, fetching new timestamp`);
                cardEventLookups.push({ idx, vehicleMid: parseInt(rec.trackit_id), plate: rec.plate, isBackfill: false, eventType: "swap", oldCardNumber, newCardNumber });
              } else {
                // Same card still inserted → preserve existing timestamp
                (rec as any).card_inserted_at = existing.card_inserted_at;
              }
            } else if (newHasCard && !existing.card_inserted_at) {
              // Card present but no timestamp recorded yet (backfill) → need event timestamp
              cardEventLookups.push({ idx, vehicleMid: parseInt(rec.trackit_id), plate: rec.plate, isBackfill: true, eventType: "inserted", oldCardNumber: null, newCardNumber });
            }
            // If no card on both sides, card_inserted_at stays null
          }

          // Batch fetch event timestamps for vehicles that need it (max 5 concurrent)
          const EVENT_BATCH = 5;
          for (let i = 0; i < cardEventLookups.length; i += EVENT_BATCH) {
            const batch = cardEventLookups.slice(i, i + EVENT_BATCH);
            const results = await Promise.all(
              batch.map(async (lookup) => {
                const eventTime = await fetchCardInsertionTime(lookup.vehicleMid);
                return { ...lookup, eventTime };
              })
            );

            for (const result of results) {
              const rec = vehicleRecords[result.idx];
              const origVehicle = filteredVehicles[result.idx];
              const origDrs = origVehicle?.data?.drs || {};
              const tachoTimestamp = origDrs.tmx || origVehicle?.data?.pos?.tmx || null;

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

              if (result.eventType === "swap") {
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
          // When new activity is detected for a driver with open draft declarations,
          // update gap_end_date to the start_time of the first new activity (real card insertion time)
          const driversWithNewActivity = new Set(
            vehicleRecords
              .filter((r: any) => r.current_driver_id)
              .map((r: any) => r.current_driver_id)
          );

          if (driversWithNewActivity.size > 0) {
            const driverIdsArray = Array.from(driversWithNewActivity);
            const { data: draftDeclarations } = await supabaseAdmin
              .from("activity_declarations")
              .select("id, driver_id, gap_end_date")
              .in("driver_id", driverIdsArray)
              .eq("status", "draft");

            for (const decl of draftDeclarations || []) {
              // Find the earliest new activity start_time for this driver
              const { data: latestActivity } = await supabaseAdmin
                .from("driver_activities")
                .select("start_time")
                .eq("driver_id", decl.driver_id)
                .order("start_time", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (latestActivity?.start_time) {
                const { error: updateDeclErr } = await supabaseAdmin
                  .from("activity_declarations")
                  .update({ gap_end_date: latestActivity.start_time })
                  .eq("id", decl.id);

                if (updateDeclErr) {
                  console.error(`[SYNC] Error updating gap_end_date for declaration ${decl.id}:`, updateDeclErr.message);
                } else {
                  console.log(`[SYNC] Updated gap_end_date for declaration ${decl.id} to ${latestActivity.start_time}`);
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
