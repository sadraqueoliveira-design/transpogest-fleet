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

    const today = new Date();
    const threshold = new Date(today);
    threshold.setDate(threshold.getDate() + 30);
    const thresholdStr = threshold.toISOString().split("T")[0];

    // Get all vehicle documents expiring within 30 days
    const { data: docs, error: docsErr } = await supabase
      .from("vehicle_documents")
      .select("id, vehicle_id, name, doc_type, expiry_date")
      .not("expiry_date", "is", null)
      .lte("expiry_date", thresholdStr);

    if (docsErr) throw docsErr;
    if (!docs || docs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No document expiry alerts", alerts: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get vehicle info
    const vehicleIds = [...new Set(docs.map((d: any) => d.vehicle_id))];
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

    const docTypeLabels: Record<string, string> = {
      insurance: "Seguro", inspection: "Inspeção", registration: "Registo",
      tachograph: "Tacógrafo", community_license: "Licença Comunitária",
      atp_certificate: "Certificado ATP", vehicle_registration: "Livrete", other: "Outro",
    };

    let expired = 0;
    let expiring = 0;
    const details: string[] = [];
    const driverAlerts: Record<string, { plate: string; docName: string; daysLeft: number }[]> = {};

    for (const doc of docs) {
      const dueDate = new Date(doc.expiry_date + "T00:00:00");
      const info = vehicleInfo[doc.vehicle_id] || { plate: "?", driverId: null };
      const daysLeft = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const label = docTypeLabels[doc.doc_type] || doc.name;

      if (daysLeft < 0) {
        expired++;
        details.push(`🔴 ${info.plate} — ${label} (expirado)`);
      } else {
        expiring++;
        details.push(`🟠 ${info.plate} — ${label} (${daysLeft}d)`);
      }

      if (info.driverId) {
        if (!driverAlerts[info.driverId]) driverAlerts[info.driverId] = [];
        driverAlerts[info.driverId].push({ plate: info.plate, docName: label, daysLeft });
      }
    }

    // Build admin summary
    const parts: string[] = [];
    if (expired > 0) parts.push(`${expired} expirado(s)`);
    if (expiring > 0) parts.push(`${expiring} a expirar`);
    const title = "📄 Alertas de Documentos";
    const body = parts.join(", ") + " — " + details.slice(0, 4).join("; ");

    // Get admin/manager IDs
    const { data: staffRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "manager"]);
    const staffIds = staffRoles?.map((r: any) => r.user_id) || [];

    // Send to admins
    if (staffIds.length > 0) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-fcm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_ROLE_KEY },
        body: JSON.stringify({
          user_ids: staffIds,
          title,
          body: body.substring(0, 250),
          data: { route: "/admin/frota" },
        }),
      });
    }

    // Send to drivers
    let driverNotifications = 0;
    for (const [driverId, alerts] of Object.entries(driverAlerts)) {
      if (staffIds.includes(driverId)) continue;

      const mostUrgent = alerts.sort((a, b) => a.daysLeft - b.daysLeft)[0];
      let driverBody: string;

      if (alerts.length === 1) {
        driverBody = mostUrgent.daysLeft < 0
          ? `${mostUrgent.plate} — ${mostUrgent.docName} expirado há ${Math.abs(mostUrgent.daysLeft)} dias`
          : `${mostUrgent.plate} — ${mostUrgent.docName} expira em ${mostUrgent.daysLeft} dias`;
      } else {
        driverBody = `${alerts.length} documentos: ${alerts.slice(0, 3).map(a =>
          `${a.docName} (${a.daysLeft < 0 ? 'expirado' : a.daysLeft + 'd'})`
        ).join(", ")}`;
      }

      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-fcm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_ROLE_KEY },
          body: JSON.stringify({
            user_ids: [driverId],
            title: "📄 Documento a expirar",
            body: driverBody.substring(0, 250),
            data: { route: "/driver/documentos" },
          }),
        });
        driverNotifications++;
      } catch (e) {
        console.error(`Failed to notify driver ${driverId}:`, e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        alerts: { expired, expiring, total: docs.length },
        notified: { staff: staffIds.length, drivers: driverNotifications },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("check-document-expiry error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
