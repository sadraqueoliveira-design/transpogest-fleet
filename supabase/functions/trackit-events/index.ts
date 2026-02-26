import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Parse request body
    const { client_id, vehicle_ids, event_ids, date_begin, date_end } = await req.json();

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: "client_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!date_begin || !date_end) {
      return new Response(
        JSON.stringify({ error: "date_begin e date_end são obrigatórios (formato: Y-m-d H:i:s)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch client credentials
    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("id, name, trackit_username, trackit_password")
      .eq("id", client_id)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: "Cliente não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!client.trackit_username || !client.trackit_password) {
      return new Response(
        JSON.stringify({ error: "Credenciais Trackit não configuradas para este cliente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = btoa(`${client.trackit_username}:${client.trackit_password}`);

    // If no vehicle_ids provided, get all vehicles for this client
    let vehicleMids = vehicle_ids;
    if (!vehicleMids || vehicleMids.length === 0) {
      const { data: vehicles } = await supabaseAdmin
        .from("vehicles")
        .select("trackit_id")
        .eq("client_id", client_id)
        .not("trackit_id", "is", null);

      vehicleMids = (vehicles || []).map((v: any) => parseInt(v.trackit_id)).filter((id: number) => !isNaN(id));
    }

    if (!vehicleMids || vehicleMids.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum veículo encontrado para este cliente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Manual v110 - Pág 6 (2.4.2 /events)
    // POST with: vehicles (Array), events (Array, optional), dateBegin, dateEnd
    const body: any = {
      vehicles: vehicleMids,
      dateBegin: date_begin,
      dateEnd: date_end,
    };

    // Optional: filter by specific event types
    if (event_ids && event_ids.length > 0) {
      body.events = event_ids;
    }

    console.log(`Consultando eventos para ${client.name}: ${vehicleMids.length} veículos, ${date_begin} a ${date_end}`);

    const trackitRes = await fetch("https://i.trackit.pt/ws/events", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!trackitRes.ok) {
      const errBody = await trackitRes.text();
      return new Response(
        JSON.stringify({ error: `API Trackit retornou ${trackitRes.status}`, details: errBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trackitJson = await trackitRes.json();

    if (trackitJson.error) {
      return new Response(
        JSON.stringify({ error: trackitJson.message || "Erro na API Trackit", code: trackitJson.code }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const events = trackitJson.data || [];

    // Map events with readable fields
    // Response fields (Pág 6): vehicleId, eventId, timestamp, eventStatus, eventSource, gpsSpeed, canbusKm
    const mappedEvents = events.map((e: any) => ({
      vehicle_id: e.vehicleId,
      event_id: e.eventId,
      timestamp: e.timestamp,
      event_status: e.eventStatus,        // 0=Inactive, 1=Active
      event_source: e.eventSource,
      gps_speed: e.gpsSpeed,
      canbus_km: e.canbusKm,
    }));

    console.log(`${client.name}: ${mappedEvents.length} eventos encontrados`);

    return new Response(
      JSON.stringify({
        client: client.name,
        total_events: mappedEvents.length,
        events: mappedEvents,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro na consulta de eventos:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
