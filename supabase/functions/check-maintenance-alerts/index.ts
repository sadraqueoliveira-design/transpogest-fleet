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

    // 1. Get all maintenance schedule entries with next_due_date
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const in15Days = new Date(today);
    in15Days.setDate(in15Days.getDate() + 15);
    const in15Str = in15Days.toISOString().split("T")[0];

    const { data: schedules, error: schedErr } = await supabase
      .from("vehicle_maintenance_schedule")
      .select("id, vehicle_id, category, next_due_date")
      .not("next_due_date", "is", null)
      .lte("next_due_date", in15Str);

    if (schedErr) throw schedErr;
    if (!schedules || schedules.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No maintenance alerts", alerts: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get vehicle plates for context
    const vehicleIds = [...new Set(schedules.map((s: any) => s.vehicle_id))];
    const { data: vehicles } = await supabase
      .from("vehicles")
      .select("id, plate")
      .in("id", vehicleIds);

    const plateMap: Record<string, string> = {};
    if (vehicles) {
      for (const v of vehicles) {
        plateMap[v.id] = v.plate;
      }
    }

    // 3. Classify by severity
    let expired = 0;
    let critical = 0; // < 7 days
    let urgent = 0;   // < 15 days
    const details: string[] = [];

    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);

    for (const s of schedules) {
      const dueDate = new Date(s.next_due_date + "T00:00:00");
      const plate = plateMap[s.vehicle_id] || "?";

      if (dueDate < today) {
        expired++;
        details.push(`🔴 ${plate} - ${s.category} (expirado)`);
      } else if (dueDate < in7Days) {
        critical++;
        details.push(`🟠 ${plate} - ${s.category} (<7 dias)`);
      } else {
        urgent++;
        details.push(`🟡 ${plate} - ${s.category} (<15 dias)`);
      }
    }

    // 4. Build notification message
    const parts: string[] = [];
    if (expired > 0) parts.push(`${expired} expirada(s)`);
    if (critical > 0) parts.push(`${critical} crítica(s)`);
    if (urgent > 0) parts.push(`${urgent} urgente(s)`);

    const title = "🔧 Alertas de Manutenção";
    const body = parts.join(", ") + ` — ${details.slice(0, 5).join("; ")}`;

    // 5. Get admin/manager user IDs
    const { data: staffRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "manager"]);

    if (!staffRoles || staffRoles.length === 0) {
      console.log("No admin/manager users to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No staff to notify", alerts: schedules.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const staffIds = staffRoles.map((r: any) => r.user_id);

    // 6. Call send-fcm to deliver push notifications
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
    console.log("FCM result:", JSON.stringify(fcmResult));

    return new Response(
      JSON.stringify({
        success: true,
        alerts: { expired, critical, urgent, total: schedules.length },
        push: fcmResult,
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
