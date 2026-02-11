import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find tachograph cards expired or expiring within 30 days
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { data: cards, error: cardsError } = await supabase
      .from("tachograph_cards")
      .select("card_number, driver_name, driver_id, expiry_date")
      .not("expiry_date", "is", null)
      .lte("expiry_date", in30Days.toISOString().split("T")[0]);

    if (cardsError) throw cardsError;
    if (!cards || cards.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No expiring cards found", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expired = cards.filter(c => new Date(c.expiry_date!) <= now);
    const expiring = cards.filter(c => new Date(c.expiry_date!) > now);

    // Also check driver card download compliance from profiles
    const { data: overdue } = await supabase
      .from("profiles")
      .select("id, full_name, next_card_download_due")
      .not("next_card_download_due", "is", null)
      .lte("next_card_download_due", now.toISOString().split("T")[0]);

    // Build notification message
    const lines: string[] = [];
    if (expired.length > 0) lines.push(`🔴 ${expired.length} cartão(ões) expirado(s)`);
    if (expiring.length > 0) lines.push(`🟡 ${expiring.length} cartão(ões) a expirar em 30 dias`);
    if (overdue && overdue.length > 0) lines.push(`⚠️ ${overdue.length} download(s) de cartão em atraso`);

    if (lines.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No alerts", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const title = "Alerta Tacógrafo";
    const body = lines.join(" | ");

    // Send push to admins/managers
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "manager"]);

    const adminIds = adminRoles?.map(r => r.user_id) || [];

    if (adminIds.length === 0 || !serviceAccountJson) {
      console.log("No admin tokens or FCM not configured, skipping push");
      return new Response(JSON.stringify({ success: true, message: body, push_sent: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call send-push function internally
    const { data: tokens } = await supabase
      .from("user_fcm_tokens")
      .select("token")
      .in("user_id", adminIds);

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ success: true, message: body, push_sent: false, reason: "No FCM tokens" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use FCM v1 API directly
    const serviceAccount = JSON.parse(serviceAccountJson);
    const projectId = serviceAccount.project_id;
    const accessToken = await getAccessToken(serviceAccount);

    let sent = 0;
    for (const { token } of tokens) {
      try {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              message: {
                token,
                notification: { title, body },
                webpush: { fcm_options: { link: "/admin/tacografo" } },
              },
            }),
          }
        );
        if (res.ok) sent++;
        else {
          const errBody = await res.text();
          if (errBody.includes("UNREGISTERED") || errBody.includes("INVALID_ARGUMENT")) {
            await supabase.from("user_fcm_tokens").delete().eq("token", token);
          }
        }
      } catch (e) {
        console.error("FCM send error:", e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: body, expired: expired.length, expiring: expiring.length, overdue: overdue?.length || 0, push_sent: sent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("notify-missing-card error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

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
