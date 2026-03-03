import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// FCM OAuth2 helper
async function getFcmAccessToken(serviceAccount: { client_email: string; private_key: string; token_uri: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: serviceAccount.token_uri,
    iat: now, exp: now + 3600,
  }));
  const textEncoder = new TextEncoder();
  const inputData = textEncoder.encode(`${header}.${claim}`);
  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, inputData);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${header}.${claim}.${sig}`;
  const tokenRes = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("FCM token error: " + JSON.stringify(tokenData));
  return tokenData.access_token;
}

interface ComplianceStatus {
  driver_id: string;
  driver_name: string | null;
  card_inserted: boolean;
  current_activity: string | null;
  current_activity_start: string | null;
  continuous_driving_minutes: number;
  continuous_driving_limit: number;
  daily_driving_minutes: number;
  daily_driving_limit: number;
  daily_work_minutes: number;
  daily_available_minutes: number;
  daily_extended_used_this_week: number;
  weekly_driving_minutes: number;
  weekly_driving_limit: number;
  biweekly_driving_minutes: number;
  biweekly_driving_limit: number;
  warnings: string[];
  violations: string[];
}

// Helper: calculate continuous driving from DB activities (fallback)
function calcContinuousFromDB(activities: any[] | null, driverId: string, todayStart: Date, now: Date): number {
  const drivingActivities = (activities || [])
    .filter((a: any) => a.driver_id === driverId && a.activity_type === "driving")
    .filter((a: any) => new Date(a.start_time) >= todayStart)
    .sort((a: any, b: any) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

  const getRealDuration = (a: any) => {
    if (!a.end_time) return Math.round((now.getTime() - new Date(a.start_time).getTime()) / 60000);
    return a.duration_minutes || 0;
  };

  let continuous = 0;
  for (const session of drivingActivities) {
    const dur = getRealDuration(session);
    continuous += dur;
    const sessionStart = new Date(session.start_time);
    const prevSession = drivingActivities.find((s: any) => {
      const sEnd = new Date(s.end_time || s.start_time);
      return sEnd < sessionStart;
    });
    if (prevSession) {
      const gapMinutes = (sessionStart.getTime() - new Date(prevSession.end_time || prevSession.start_time).getTime()) / 60000;
      if (gapMinutes >= 45) break;
    }
  }
  return continuous;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json().catch(() => ({}));
    const targetDriverId = body.driver_id || null;

    // Fetch compliance rules
    const { data: rules } = await supabaseAdmin
      .from("compliance_rules")
      .select("rule_key, value_minutes");

    const ruleMap: Record<string, number> = {};
    (rules || []).forEach((r: any) => { ruleMap[r.rule_key] = r.value_minutes; });

    const CONTINUOUS_LIMIT = ruleMap.max_continuous_driving || 270;
    const CONTINUOUS_WARNING = ruleMap.continuous_driving_warning || 255;
    const DAILY_STANDARD = ruleMap.max_daily_driving_standard || 540;
    const DAILY_EXTENDED = ruleMap.max_daily_driving_extended || 600;
    const DAILY_WARNING = ruleMap.daily_driving_warning || 525;
    const WEEKLY_LIMIT = ruleMap.max_weekly_driving || 3360;
    const BIWEEKLY_LIMIT = ruleMap.max_biweekly_driving || 5400;

    // Time boundaries
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Monday of current week
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - mondayOffset);
    weekStart.setHours(0, 0, 0, 0);

    // Two weeks ago Monday
    const biweekStart = new Date(weekStart);
    biweekStart.setDate(biweekStart.getDate() - 7);

    // Get drivers with vehicles (active drivers)
    let driversQuery = supabaseAdmin
      .from("vehicles")
      .select("current_driver_id, trackit_id, client_id, tachograph_status")
      .not("current_driver_id", "is", null);

    if (targetDriverId) {
      driversQuery = driversQuery.eq("current_driver_id", targetDriverId);
    }

    const { data: vehicleDrivers } = await driversQuery;
    const vehicleMap = new Map<string, any>();
    const activeDriverIds: string[] = [];
    for (const v of vehicleDrivers || []) {
      if (v.current_driver_id) {
        activeDriverIds.push(v.current_driver_id);
        vehicleMap.set(v.current_driver_id, v);
      }
    }
    const driverIds = [...new Set(activeDriverIds)];

    if (driverIds.length === 0) {
      if (targetDriverId) {
        driverIds.push(targetDriverId);
      } else {
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // === Read cached Trackit driverList data from tachograph_status ===
    // (Populated by sync-trackit-data cron every 5 min)

    // === Fallback: fetch driver_activities from DB ===
    const { data: activities } = await supabaseAdmin
      .from("driver_activities")
      .select("driver_id, activity_type, start_time, end_time, duration_minutes")
      .in("driver_id", driverIds)
      .gte("start_time", biweekStart.toISOString());

    const { data: openActivities } = await supabaseAdmin
      .from("driver_activities")
      .select("driver_id, activity_type, start_time")
      .in("driver_id", driverIds)
      .is("end_time", null)
      .order("start_time", { ascending: false });

    // Fetch driver profiles
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", driverIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name]));

    // State map for Trackit current_state
    const stateMap: Record<number, string> = { 0: "rest", 1: "available", 2: "work", 3: "driving" };

    // Process each driver
    const results: ComplianceStatus[] = [];
    const newViolations: Array<{ driver_id: string; violation_type: string; severity: string; details: any }> = [];

    for (const driverId of driverIds) {
      const vehicle = vehicleMap.get(driverId);
      
      // Parse cached tacho_compliance from tachograph_status
      let cachedCompliance: any = null;
      if (vehicle?.tachograph_status) {
        try {
          const status = typeof vehicle.tachograph_status === 'string' 
            ? JSON.parse(vehicle.tachograph_status) 
            : vehicle.tachograph_status;
          if (status?.tacho_compliance && !status.tacho_compliance.is_old_data) {
            // Check freshness: only use if updated within last 15 minutes
            const updatedAt = status.tacho_compliance.updated_at ? new Date(status.tacho_compliance.updated_at).getTime() : 0;
            const FIFTEEN_MIN = 15 * 60 * 1000;
            if (now.getTime() - updatedAt < FIFTEEN_MIN) {
              cachedCompliance = status.tacho_compliance;
            }
          }
        } catch { /* parse error, use fallback */ }
      }
      
      const useTrackit = !!cachedCompliance;

      let continuousDriving = 0;
      let dailyDriving = 0;
      let dailyWork = 0;
      let dailyAvailable = 0;
      let weeklyDriving = 0;
      let biweeklyDriving = 0;
      let extensionsUsed = 0;
      let currentActivity: string | null = null;
      let currentActivityStart: string | null = null;

      if (useTrackit) {
        // === PRIMARY: Cached Trackit tachograph data ===
        const tc = cachedCompliance;
        console.log(`[TRACKIT-CACHE] Driver ${driverId}: using cached compliance data`);
        
        // API docs say "minutes" but actual values are in seconds — convert
        // Verify: if total_drive_journay > 1440 (24h in min), it's likely seconds
        const isSeconds = tc.total_drive_journay > 1440 || tc.total_drive_week > 10080;
        const divisor = isSeconds ? 60 : 1;
        
        dailyDriving = Math.round((tc.total_drive_journay ?? 0) / divisor);
        weeklyDriving = Math.round((tc.total_drive_week ?? 0) / divisor);
        biweeklyDriving = Math.round((tc.total_drive_fortnight ?? 0) / divisor);
        extensionsUsed = tc.extended_driver_count ?? 0;
        currentActivity = stateMap[tc.current_state] ?? null;

        // Daily work/available: estimate from DB (Trackit doesn't provide these)
        const driverActivities = (activities || []).filter((a: any) => a.driver_id === driverId);
        const getRealDuration = (a: any) => {
          if (!a.end_time) return Math.round((now.getTime() - new Date(a.start_time).getTime()) / 60000);
          return a.duration_minutes || 0;
        };
        dailyWork = driverActivities
          .filter((a: any) => a.activity_type === "work" && new Date(a.start_time) >= todayStart)
          .reduce((sum: number, a: any) => sum + getRealDuration(a), 0);
        dailyAvailable = driverActivities
          .filter((a: any) => a.activity_type === "available" && new Date(a.start_time) >= todayStart)
          .reduce((sum: number, a: any) => sum + getRealDuration(a), 0);

        // Continuous driving: fallback to DB (driverStatePerDriver is also slow)
        continuousDriving = calcContinuousFromDB(activities, driverId, todayStart, now);

        // Activity start: from DB open activities
        const currentOpen = (openActivities || []).find((a: any) => a.driver_id === driverId);
        currentActivityStart = currentOpen?.start_time || null;
      } else {
        // === FALLBACK: Calculate from driver_activities in DB ===

        const driverActivities = (activities || []).filter((a: any) => a.driver_id === driverId);
        const drivingActivities = driverActivities.filter((a: any) => a.activity_type === "driving");

        const currentOpen = (openActivities || []).find((a: any) => a.driver_id === driverId);
        currentActivity = currentOpen?.activity_type || null;
        currentActivityStart = currentOpen?.start_time || null;

        const getRealDuration = (a: any) => {
          if (!a.end_time) return Math.round((now.getTime() - new Date(a.start_time).getTime()) / 60000);
          return a.duration_minutes || 0;
        };

        continuousDriving = calcContinuousFromDB(activities, driverId, todayStart, now);

        dailyDriving = drivingActivities
          .filter((a: any) => new Date(a.start_time) >= todayStart)
          .reduce((sum: number, a: any) => sum + getRealDuration(a), 0);

        dailyWork = driverActivities
          .filter((a: any) => a.activity_type === "work" && new Date(a.start_time) >= todayStart)
          .reduce((sum: number, a: any) => sum + getRealDuration(a), 0);

        dailyAvailable = driverActivities
          .filter((a: any) => a.activity_type === "available" && new Date(a.start_time) >= todayStart)
          .reduce((sum: number, a: any) => sum + getRealDuration(a), 0);

        weeklyDriving = drivingActivities
          .filter((a: any) => new Date(a.start_time) >= weekStart)
          .reduce((sum: number, a: any) => sum + getRealDuration(a), 0);

        biweeklyDriving = drivingActivities
          .reduce((sum: number, a: any) => sum + getRealDuration(a), 0);

        // Count 10h extension days this week
        const dailyTotals = new Map<string, number>();
        drivingActivities
          .filter((a: any) => new Date(a.start_time) >= weekStart)
          .forEach((a: any) => {
            const day = new Date(a.start_time).toISOString().split("T")[0];
            dailyTotals.set(day, (dailyTotals.get(day) || 0) + getRealDuration(a));
          });
        extensionsUsed = [...dailyTotals.values()].filter(v => v > DAILY_STANDARD).length;
      }

      // Determine warnings and violations
      const warnings: string[] = [];
      const violations: string[] = [];
      const dailyLimit = extensionsUsed < 2 ? DAILY_EXTENDED : DAILY_STANDARD;

      if (continuousDriving >= CONTINUOUS_LIMIT) {
        violations.push("CONTINUOUS_LIMIT_EXCEEDED");
        newViolations.push({
          driver_id: driverId,
          violation_type: "continuous_limit_exceeded",
          severity: "critical",
          details: { minutes: continuousDriving, limit: CONTINUOUS_LIMIT, source: useTrackit ? "trackit" : "db" },
        });
      } else if (continuousDriving >= CONTINUOUS_WARNING) {
        warnings.push("CONTINUOUS_LIMIT_NEAR");
      }

      if (dailyDriving >= dailyLimit) {
        violations.push("DAILY_LIMIT_EXCEEDED");
        newViolations.push({
          driver_id: driverId,
          violation_type: "daily_limit_exceeded",
          severity: "critical",
          details: { minutes: dailyDriving, limit: dailyLimit, source: useTrackit ? "trackit" : "db" },
        });
      } else if (dailyDriving >= DAILY_WARNING) {
        warnings.push("DAILY_LIMIT_NEAR");
      }

      if (weeklyDriving >= WEEKLY_LIMIT) {
        violations.push("WEEKLY_LIMIT_EXCEEDED");
        newViolations.push({
          driver_id: driverId,
          violation_type: "weekly_limit_exceeded",
          severity: "critical",
          details: { minutes: weeklyDriving, limit: WEEKLY_LIMIT, source: useTrackit ? "trackit" : "db" },
        });
      }

      if (biweeklyDriving >= BIWEEKLY_LIMIT) {
        violations.push("BIWEEKLY_LIMIT_EXCEEDED");
        newViolations.push({
          driver_id: driverId,
          violation_type: "biweekly_limit_exceeded",
          severity: "critical",
          details: { minutes: biweeklyDriving, limit: BIWEEKLY_LIMIT, source: useTrackit ? "trackit" : "db" },
        });
      }

      const cardInserted = activeDriverIds.includes(driverId);

      results.push({
        driver_id: driverId,
        driver_name: profileMap.get(driverId) || null,
        card_inserted: cardInserted,
        current_activity: currentActivity,
        current_activity_start: currentActivityStart,
        continuous_driving_minutes: continuousDriving,
        continuous_driving_limit: CONTINUOUS_LIMIT,
        daily_driving_minutes: dailyDriving,
        daily_driving_limit: dailyLimit,
        daily_work_minutes: dailyWork,
        daily_available_minutes: dailyAvailable,
        daily_extended_used_this_week: extensionsUsed,
        weekly_driving_minutes: weeklyDriving,
        weekly_driving_limit: WEEKLY_LIMIT,
        biweekly_driving_minutes: biweeklyDriving,
        biweekly_driving_limit: BIWEEKLY_LIMIT,
        warnings,
        violations,
        data_source: useTrackit ? "trackit" : "database",
      } as any);
    }

    // Log new violations and send push notifications (avoid duplicates within last hour)
    const pushMessages: Array<{ driver_id: string; title: string; body: string; link: string }> = [];

    // Also send warnings as push (not just violations)
    for (const r of results) {
      if (r.warnings.includes("CONTINUOUS_LIMIT_NEAR")) {
        pushMessages.push({
          driver_id: r.driver_id,
          title: "⚠️ Pausa Obrigatória em Breve",
          body: `Condução contínua: ${Math.floor(r.continuous_driving_minutes / 60)}h${(r.continuous_driving_minutes % 60).toString().padStart(2, "0")}. Procure um local para parar.`,
          link: "/motorista",
        });
      }
      if (r.warnings.includes("DAILY_LIMIT_NEAR")) {
        pushMessages.push({
          driver_id: r.driver_id,
          title: "⚠️ Fim de Turno Aproxima-se",
          body: `Condução diária: ${Math.floor(r.daily_driving_minutes / 60)}h${(r.daily_driving_minutes % 60).toString().padStart(2, "0")} / ${Math.floor(r.daily_driving_limit / 60)}h.`,
          link: "/motorista",
        });
      }
    }

    for (const v of newViolations) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabaseAdmin
        .from("compliance_violations")
        .select("id")
        .eq("driver_id", v.driver_id)
        .eq("violation_type", v.violation_type)
        .gte("detected_at", oneHourAgo)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabaseAdmin.from("compliance_violations").insert(v);

        // Map violation to push message
        const msgMap: Record<string, { title: string; body: string }> = {
          continuous_limit_exceeded: { title: "🚨 PAUSA DE 45 MIN NECESSÁRIA AGORA!", body: "Excedeste o limite de condução contínua de 4h30." },
          daily_limit_exceeded: { title: "🚨 Limite Diário Excedido!", body: "Excedeste o limite de condução diária. Para imediatamente." },
          weekly_limit_exceeded: { title: "🚨 Limite Semanal de 56h Excedido!", body: "Excedeste o limite semanal de condução." },
          biweekly_limit_exceeded: { title: "🚨 Limite Bi-Semanal de 90h Excedido!", body: "Excedeste o limite de 90h em duas semanas." },
        };
        const msg = msgMap[v.violation_type];
        if (msg) {
          pushMessages.push({ driver_id: v.driver_id, ...msg, link: "/motorista" });
        }
      }
    }

    // Send push notifications via FCM
    if (pushMessages.length > 0) {
      const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
      if (serviceAccountJson) {
        try {
          const serviceAccount = JSON.parse(serviceAccountJson);
          const accessToken = await getFcmAccessToken(serviceAccount);
          const projectId = serviceAccount.project_id;

          // Deduplicate by driver_id (keep most severe)
          const byDriver = new Map<string, typeof pushMessages[0]>();
          for (const msg of pushMessages) {
            const existing = byDriver.get(msg.driver_id);
            if (!existing || msg.title.includes("🚨")) {
              byDriver.set(msg.driver_id, msg);
            }
          }

          for (const [driverId, msg] of byDriver) {
            // Check if we already sent a push to this driver in last 10 min
            const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            const { data: recentViolation } = await supabaseAdmin
              .from("compliance_violations")
              .select("id")
              .eq("driver_id", driverId)
              .gte("detected_at", tenMinAgo)
              .limit(2);
            // Skip if we already logged 2+ violations in last 10 min (avoid spam)
            if (recentViolation && recentViolation.length >= 2) continue;

            const { data: tokens } = await supabaseAdmin
              .from("user_fcm_tokens")
              .select("token")
              .eq("user_id", driverId);

            for (const { token } of tokens || []) {
              try {
                await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
                  method: "POST",
                  headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    message: {
                      token,
                      notification: { title: msg.title, body: msg.body },
                      data: { link: msg.link },
                      webpush: { fcm_options: { link: msg.link } },
                    },
                  }),
                });
              } catch (e) {
                console.error("Push send error:", e);
              }
            }
          }

          // Also notify admins about violations
          if (newViolations.length > 0) {
            const { data: adminRoles } = await supabaseAdmin
              .from("user_roles")
              .select("user_id")
              .in("role", ["admin", "manager"]);

            const adminIds = (adminRoles || []).map((r: any) => r.user_id);
            if (adminIds.length > 0) {
              const { data: adminTokens } = await supabaseAdmin
                .from("user_fcm_tokens")
                .select("token")
                .in("user_id", adminIds);

              const violationSummary = newViolations.map(v => {
                const name = profileMap.get(v.driver_id) || v.driver_id.slice(0, 8);
                return `${name}: ${v.violation_type.replace(/_/g, " ")}`;
              }).join(", ");

              for (const { token } of adminTokens || []) {
                try {
                  await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                      message: {
                        token,
                        notification: {
                          title: `🚨 ${newViolations.length} Violação(ões) de Compliance`,
                          body: violationSummary,
                        },
                        data: { link: "/admin" },
                        webpush: { fcm_options: { link: "/admin" } },
                      },
                    }),
                  });
                } catch (e) {
                  console.error("Admin push error:", e);
                }
              }
            }
          }
        } catch (e) {
          console.error("FCM setup error:", e);
        }
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
