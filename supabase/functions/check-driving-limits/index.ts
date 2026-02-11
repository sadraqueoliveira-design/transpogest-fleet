import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ComplianceStatus {
  driver_id: string;
  driver_name: string | null;
  continuous_driving_minutes: number;
  continuous_driving_limit: number;
  daily_driving_minutes: number;
  daily_driving_limit: number;
  daily_extended_used_this_week: number;
  weekly_driving_minutes: number;
  weekly_driving_limit: number;
  biweekly_driving_minutes: number;
  biweekly_driving_limit: number;
  warnings: string[];
  violations: string[];
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
      .select("current_driver_id")
      .not("current_driver_id", "is", null);

    if (targetDriverId) {
      driversQuery = driversQuery.eq("current_driver_id", targetDriverId);
    }

    const { data: vehicleDrivers } = await driversQuery;
    const driverIds = [...new Set((vehicleDrivers || []).map((v: any) => v.current_driver_id).filter(Boolean))];

    if (driverIds.length === 0) {
      // If targeting a specific driver not currently assigned, still check them
      if (targetDriverId) {
        driverIds.push(targetDriverId);
      } else {
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch all activities for these drivers in the biweekly window
    const { data: activities } = await supabaseAdmin
      .from("driver_activities")
      .select("driver_id, activity_type, start_time, end_time, duration_minutes")
      .in("driver_id", driverIds)
      .gte("start_time", biweekStart.toISOString())
      .eq("activity_type", "driving");

    // Fetch driver profiles
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", driverIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name]));

    // Process each driver
    const results: ComplianceStatus[] = [];
    const newViolations: Array<{ driver_id: string; violation_type: string; severity: string; details: any }> = [];

    for (const driverId of driverIds) {
      const driverActivities = (activities || []).filter((a: any) => a.driver_id === driverId);

      // Calculate continuous driving (latest unbroken driving session)
      let continuousDriving = 0;
      const todayDrivingSessions = driverActivities
        .filter((a: any) => new Date(a.start_time) >= todayStart)
        .sort((a: any, b: any) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

      // Walk backwards from most recent to find continuous driving
      for (const session of todayDrivingSessions) {
        const dur = session.duration_minutes || 0;
        continuousDriving += dur;
        // Check if there was a sufficient break before this session
        const sessionStart = new Date(session.start_time);
        const prevSession = todayDrivingSessions.find((s: any) => {
          const sEnd = new Date(s.end_time || s.start_time);
          return sEnd < sessionStart;
        });
        if (prevSession) {
          const gapMinutes = (sessionStart.getTime() - new Date(prevSession.end_time || prevSession.start_time).getTime()) / 60000;
          if (gapMinutes >= 45) break; // Valid break found, stop counting continuous
        }
      }

      // Daily driving total
      const dailyDriving = driverActivities
        .filter((a: any) => new Date(a.start_time) >= todayStart)
        .reduce((sum: number, a: any) => sum + (a.duration_minutes || 0), 0);

      // Weekly driving total
      const weeklyDriving = driverActivities
        .filter((a: any) => new Date(a.start_time) >= weekStart)
        .reduce((sum: number, a: any) => sum + (a.duration_minutes || 0), 0);

      // Biweekly driving total
      const biweeklyDriving = driverActivities
        .reduce((sum: number, a: any) => sum + (a.duration_minutes || 0), 0);

      // Count 10h extension days this week
      const dailyTotals = new Map<string, number>();
      driverActivities
        .filter((a: any) => new Date(a.start_time) >= weekStart)
        .forEach((a: any) => {
          const day = new Date(a.start_time).toISOString().split("T")[0];
          dailyTotals.set(day, (dailyTotals.get(day) || 0) + (a.duration_minutes || 0));
        });
      const extensionsUsed = [...dailyTotals.values()].filter(v => v > DAILY_STANDARD).length;

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
          details: { minutes: continuousDriving, limit: CONTINUOUS_LIMIT },
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
          details: { minutes: dailyDriving, limit: dailyLimit },
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
          details: { minutes: weeklyDriving, limit: WEEKLY_LIMIT },
        });
      }

      if (biweeklyDriving >= BIWEEKLY_LIMIT) {
        violations.push("BIWEEKLY_LIMIT_EXCEEDED");
        newViolations.push({
          driver_id: driverId,
          violation_type: "biweekly_limit_exceeded",
          severity: "critical",
          details: { minutes: biweeklyDriving, limit: BIWEEKLY_LIMIT },
        });
      }

      results.push({
        driver_id: driverId,
        driver_name: profileMap.get(driverId) || null,
        continuous_driving_minutes: continuousDriving,
        continuous_driving_limit: CONTINUOUS_LIMIT,
        daily_driving_minutes: dailyDriving,
        daily_driving_limit: dailyLimit,
        daily_extended_used_this_week: extensionsUsed,
        weekly_driving_minutes: weeklyDriving,
        weekly_driving_limit: WEEKLY_LIMIT,
        biweekly_driving_minutes: biweeklyDriving,
        biweekly_driving_limit: BIWEEKLY_LIMIT,
        warnings,
        violations,
      });
    }

    // Log new violations (avoid duplicates within last hour)
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
