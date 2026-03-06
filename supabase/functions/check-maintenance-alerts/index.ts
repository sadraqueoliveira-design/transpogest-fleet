const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Read configurable threshold from app_config
    let alertDays = 15;
    const { data: configRow } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "maintenance_alert_days")
      .single();
    if (configRow?.value) {
      const parsed = parseInt(configRow.value);
      if (!isNaN(parsed) && parsed > 0) alertDays = parsed;
    }

    // 2. Get all maintenance schedule entries with next_due_date within threshold
    const today = new Date();
    const thresholdDate = new Date(today);
    thresholdDate.setDate(thresholdDate.getDate() + alertDays);
    const thresholdStr = thresholdDate.toISOString().split("T")[0];

    const { data: schedules, error: schedErr } = await supabase
      .from("vehicle_maintenance_schedule")
      .select("id, vehicle_id, category, next_due_date")
      .not("next_due_date", "is", null)
      .lte("next_due_date", thresholdStr);

    if (schedErr) throw schedErr;
    if (!schedules || schedules.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No maintenance alerts", alerts: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get vehicle plates and current_driver_id for context
    const vehicleIds = [...new Set(schedules.map((s: any) => s.vehicle_id))];
    const { data: vehicles } = await supabase
      .from("vehicles")
      .select("id, plate, current_driver_id")
      .in("id", vehicleIds);

    const vehicleInfo: Record<string, { plate: string; driverId: string | null }> = {};
    if (vehicles) {
      for (const v of vehicles) {
        vehicleInfo[v.id] = { plate: v.plate, driverId: v.current_driver_id };
      }
    }

    // 4. Classify by severity
    let expired = 0;
    let critical = 0;
    let urgent = 0;
    const details: string[] = [];

    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);

    // Group alerts by driver for individual notifications
    const driverAlerts: Record<string, { plate: string; category: string; daysLeft: number }[]> = {};

    for (const s of schedules) {
      const dueDate = new Date(s.next_due_date + "T00:00:00");
      const info = vehicleInfo[s.vehicle_id] || { plate: "?", driverId: null };
      const daysLeft = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (dueDate < today) {
        expired++;
        details.push(`🔴 ${info.plate} - ${s.category} (expirado)`);
      } else if (dueDate < in7Days) {
        critical++;
        details.push(`🟠 ${info.plate} - ${s.category} (<7 dias)`);
      } else {
        urgent++;
        details.push(`🟡 ${info.plate} - ${s.category} (<${alertDays} dias)`);
      }

      // Track per-driver alerts
      if (info.driverId) {
        if (!driverAlerts[info.driverId]) driverAlerts[info.driverId] = [];
        driverAlerts[info.driverId].push({ plate: info.plate, category: s.category, daysLeft });
      }
    }

    // 5. Build admin notification message
    const parts: string[] = [];
    if (expired > 0) parts.push(`${expired} expirada(s)`);
    if (critical > 0) parts.push(`${critical} crítica(s)`);
    if (urgent > 0) parts.push(`${urgent} urgente(s)`);

    const title = "🔧 Alertas de Manutenção";
    const body = parts.join(", ") + ` — ${details.slice(0, 5).join("; ")}`;

    // 6. Get admin/manager user IDs
    const { data: staffRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "manager"]);

    const staffIds = staffRoles?.map((r: any) => r.user_id) || [];

    // 7. Send consolidated push to admins/managers
    if (staffIds.length > 0) {
      const fcmRes = await fetch(`${SUPABASE_URL}/functions/v1/send-fcm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
          user_ids: staffIds,
          title,
          body: body.substring(0, 250),
          data: { route: "/admin/manutencao" },
        }),
      });
      const fcmResult = await fcmRes.json();
      console.log("Admin FCM result:", JSON.stringify(fcmResult));
    }

    // 8. Send individual push to drivers with assigned vehicles
    let driverNotifications = 0;
    for (const [driverId, alerts] of Object.entries(driverAlerts)) {
      // Skip if this driver is also an admin/manager (they already got the consolidated one)
      if (staffIds.includes(driverId)) continue;

      // Build personalized message
      const mostUrgent = alerts.sort((a, b) => a.daysLeft - b.daysLeft)[0];
      const driverTitle = "🔧 Manutenção do seu veículo";
      let driverBody: string;

      if (alerts.length === 1) {
        if (mostUrgent.daysLeft < 0) {
          driverBody = `${mostUrgent.plate} — ${mostUrgent.category} expirado há ${Math.abs(mostUrgent.daysLeft)} dias`;
        } else {
          driverBody = `${mostUrgent.plate} — ${mostUrgent.category} expira em ${mostUrgent.daysLeft} dias`;
        }
      } else {
        driverBody = `${alerts.length} alertas: ${alerts.slice(0, 3).map(a => 
          `${a.plate} ${a.category} (${a.daysLeft < 0 ? 'expirado' : a.daysLeft + 'd'})`
        ).join(", ")}`;
      }

      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-fcm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({
            user_ids: [driverId],
            title: driverTitle,
            body: driverBody.substring(0, 250),
            data: { route: "/driver" },
          }),
        });
        driverNotifications++;
      } catch (e) {
        console.error(`Failed to notify driver ${driverId}:`, e);
      }
    }

    console.log(`Notified ${staffIds.length} staff, ${driverNotifications} drivers`);

    return new Response(
      JSON.stringify({
        success: true,
        alertDays,
        alerts: { expired, critical, urgent, total: schedules.length },
        notified: { staff: staffIds.length, drivers: driverNotifications },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("check-maintenance-alerts error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
