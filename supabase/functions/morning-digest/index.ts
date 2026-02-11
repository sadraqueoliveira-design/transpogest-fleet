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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Find all auto-approved audit logs not yet sent in morning digest
    const { data: pendingLogs, error: logError } = await supabaseAdmin
      .from("signature_audit_logs")
      .select("*, declaration_id, signer_name, signed_at, approval_rule_id")
      .eq("approval_type", "auto_approval")
      .eq("morning_digest_sent", false);

    if (logError) throw logError;

    if (!pendingLogs || pendingLogs.length === 0) {
      return new Response(
        JSON.stringify({ message: "Sem auto-aprovações pendentes de notificação.", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group by manager (via approval_rule)
    const ruleIds = [...new Set(pendingLogs.map((l: any) => l.approval_rule_id).filter(Boolean))];
    
    const { data: rules } = await supabaseAdmin
      .from("approval_rules")
      .select("id, manager_id")
      .in("id", ruleIds);

    const ruleManagerMap = new Map((rules || []).map((r: any) => [r.id, r.manager_id]));

    // Group logs by manager
    const managerLogs = new Map<string, any[]>();
    for (const log of pendingLogs) {
      const managerId = ruleManagerMap.get(log.approval_rule_id);
      if (!managerId) continue;
      if (!managerLogs.has(managerId)) managerLogs.set(managerId, []);
      managerLogs.get(managerId)!.push(log);
    }

    let totalSent = 0;
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");

    for (const [managerId, logs] of managerLogs) {
      const count = logs.length;

      // Send push notification
      if (serviceAccountJson) {
        try {
          const { data: managerTokens } = await supabaseAdmin
            .from("user_fcm_tokens")
            .select("token")
            .eq("user_id", managerId);

          if (managerTokens && managerTokens.length > 0) {
            const serviceAccount = JSON.parse(serviceAccountJson);
            const accessToken = await getAccessToken(serviceAccount);

            for (const { token } of managerTokens) {
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
                          title: "Resumo de Auto-Aprovações",
                          body: `Durante a noite, ${count} declaração(ões) foram emitidas automaticamente em seu nome. Por favor, reveja.`,
                        },
                        data: { route: "/admin/declaracoes" },
                        webpush: { fcm_options: { link: "/admin/declaracoes" } },
                      },
                    }),
                  }
                );

                if (res.ok) {
                  totalSent++;
                  console.log(`[MORNING-DIGEST] Push sent to manager ${managerId}`);
                } else {
                  const errBody = await res.text();
                  console.error(`[MORNING-DIGEST] FCM error:`, errBody);
                  if (errBody.includes("UNREGISTERED") || errBody.includes("INVALID_ARGUMENT")) {
                    await supabaseAdmin.from("user_fcm_tokens").delete().eq("token", token);
                  }
                }
              } catch (e) {
                console.error("[MORNING-DIGEST] Push error:", e);
              }
            }
          }
        } catch (e) {
          console.error("[MORNING-DIGEST] Notification error:", e);
        }
      }

      // Mark all logs as sent
      const logIds = logs.map((l: any) => l.id);
      await supabaseAdmin
        .from("signature_audit_logs")
        .update({ morning_digest_sent: true })
        .in("id", logIds);
    }

    console.log(`[MORNING-DIGEST] Digest complete. ${totalSent} notifications sent.`);

    return new Response(
      JSON.stringify({ message: "Digest enviado.", sent: totalSent, managers: managerLogs.size }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[MORNING-DIGEST] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
