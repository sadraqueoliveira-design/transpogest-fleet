import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getAccessToken(serviceAccount: { client_email: string; private_key: string; token_uri: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3600,
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
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${header}.${claim}.${sig}`;
  const tokenRes = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Failed to get access token");
  return tokenData.access_token;
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

    const now = new Date();
    const GAP_THRESHOLD_HOURS = 72;
    const thresholdDate = new Date(now.getTime() - GAP_THRESHOLD_HOURS * 60 * 60 * 1000);

    // Get all drivers (users with driver role)
    const { data: driverRoles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "driver");

    if (rolesError) throw rolesError;
    if (!driverRoles || driverRoles.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhum motorista encontrado.", created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const driverIds = driverRoles.map((r) => r.user_id);

    // Get profiles for these drivers
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, last_card_download_at")
      .in("id", driverIds);

    if (profilesError) throw profilesError;

    // Get the latest driver_activity for each driver
    const { data: activities, error: actError } = await supabaseAdmin
      .from("driver_activities")
      .select("driver_id, end_time, start_time")
      .in("driver_id", driverIds)
      .order("start_time", { ascending: false });

    if (actError) throw actError;

    // Build map of last activity per driver
    const lastActivityMap = new Map<string, Date>();
    if (activities) {
      for (const a of activities) {
        if (!lastActivityMap.has(a.driver_id)) {
          const actDate = a.end_time ? new Date(a.end_time) : new Date(a.start_time);
          lastActivityMap.set(a.driver_id, actDate);
        }
      }
    }

    // Get existing open declarations to avoid duplicates
    const { data: existingDecls, error: declError } = await supabaseAdmin
      .from("activity_declarations")
      .select("driver_id, gap_start_date, gap_end_date, status")
      .in("status", ["draft", "signed"]);

    if (declError) throw declError;

    const openDeclDrivers = new Set(
      (existingDecls || [])
        .filter((d) => d.status === "draft")
        .map((d) => d.driver_id)
    );

    let created = 0;
    const details: Array<{ driver: string; gap_hours: number }> = [];

    for (const profile of profiles || []) {
      // Skip if already has an open draft declaration
      if (openDeclDrivers.has(profile.id)) {
        console.log(`[TACHO-GAP] ${profile.full_name}: já tem declaração draft aberta, ignorando.`);
        continue;
      }

      // Determine last known activity
      let lastActivity: Date | null = null;

      // Check driver_activities table first
      const actDate = lastActivityMap.get(profile.id);
      if (actDate) {
        lastActivity = actDate;
      }

      // Fallback to last_card_download_at from profile
      if (!lastActivity && profile.last_card_download_at) {
        lastActivity = new Date(profile.last_card_download_at);
      }

      if (!lastActivity) {
        console.log(`[TACHO-GAP] ${profile.full_name}: sem atividade registada, ignorando.`);
        continue;
      }

      const gapHours = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);

      if (gapHours > GAP_THRESHOLD_HOURS) {
        console.log(`[TACHO-GAP] ${profile.full_name}: gap de ${Math.round(gapHours)}h detectado, criando declaração.`);

        const { error: insertError } = await supabaseAdmin
          .from("activity_declarations")
          .insert({
            driver_id: profile.id,
            status: "draft",
            gap_start_date: lastActivity.toISOString(),
            gap_end_date: now.toISOString(),
            company_name: "Transportes Florêncio & Silva, S.A.",
          });

        if (insertError) {
          console.error(`[TACHO-GAP] Erro ao criar declaração para ${profile.full_name}:`, insertError);
        } else {
          created++;
          details.push({ driver: profile.full_name || "Unknown", gap_hours: Math.round(gapHours) });

          // Send push notification to the driver
          try {
            const { data: driverTokens } = await supabaseAdmin
              .from("user_fcm_tokens")
              .select("token")
              .eq("user_id", profile.id);

            if (driverTokens && driverTokens.length > 0) {
              const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
              if (serviceAccountJson) {
                const serviceAccount = JSON.parse(serviceAccountJson);
                const accessToken = await getAccessToken(serviceAccount);
                const firstName = (profile.full_name || "Motorista").split(" ")[0];

                for (const { token } of driverTokens) {
                  try {
                    const res = await fetch(
                      `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
                      {
                        method: "POST",
                        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                        body: JSON.stringify({
                          message: {
                            token,
                            notification: {
                              title: "Declaração de Atividade",
                              body: `Olá ${firstName}, detetámos ${Math.round(gapHours)}h sem cartão. Toque para justificar a ausência.`,
                            },
                            data: { route: "/motorista/declaracoes" },
                            webpush: { fcm_options: { link: "/motorista/declaracoes" } },
                          },
                        }),
                      }
                    );
                    if (!res.ok) {
                      const errBody = await res.text();
                      console.error(`[TACHO-GAP] FCM error for ${profile.full_name}:`, errBody);
                      if (errBody.includes("UNREGISTERED") || errBody.includes("INVALID_ARGUMENT")) {
                        await supabaseAdmin.from("user_fcm_tokens").delete().eq("token", token);
                      }
                    } else {
                      console.log(`[TACHO-GAP] Push sent to ${profile.full_name}`);
                    }
                  } catch (pushErr) {
                    console.error(`[TACHO-GAP] Push error:`, pushErr);
                  }
                }
              }
            }
          } catch (notifErr) {
            console.error(`[TACHO-GAP] Notification error for ${profile.full_name}:`, notifErr);
          }
        }
      }
    }

    console.log(`[TACHO-GAP] Verificação concluída. ${created} declarações criadas.`);

    return new Response(
      JSON.stringify({ message: `Verificação concluída`, created, details }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[TACHO-GAP] Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
