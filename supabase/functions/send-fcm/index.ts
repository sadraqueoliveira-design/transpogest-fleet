const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendFcmPayload {
  user_id?: string;
  user_ids?: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

async function getAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
  token_uri: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = btoa(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: serviceAccount.token_uri,
      iat: now,
      exp: now + 3600,
    })
  );

  const textEncoder = new TextEncoder();
  const inputData = textEncoder.encode(`${header}.${claim}`);

  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, inputData);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${claim}.${sig}`;

  const tokenRes = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Failed to get access token: " + JSON.stringify(tokenData));
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");

    if (!serviceAccountJson) throw new Error("FIREBASE_SERVICE_ACCOUNT secret not set");

    let cleanedJson = serviceAccountJson.trim();
    if (
      (cleanedJson.startsWith('"') && cleanedJson.endsWith('"')) ||
      (cleanedJson.startsWith("'") && cleanedJson.endsWith("'"))
    ) {
      cleanedJson = cleanedJson.slice(1, -1);
    }
    cleanedJson = cleanedJson.replace(/\\\\n/g, "\\n");

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(cleanedJson);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
    }
    const projectId = serviceAccount.project_id;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Optional auth check (allow service-to-service calls without auth)
    const authHeader = req.headers.get("Authorization");
    let callerId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user: caller },
      } = await supabase.auth.getUser(token);
      if (caller) {
        callerId = caller.id;
        // Check caller is admin/manager
        const { data: callerRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", caller.id)
          .single();

        if (!callerRole || !["admin", "manager"].includes(callerRole.role)) {
          throw new Error("Insufficient permissions");
        }
      }
    }

    const payload: SendFcmPayload = await req.json();
    if (!payload.title || !payload.body) throw new Error("title and body are required");

    // Build user IDs list
    const targetUserIds: string[] = [];
    if (payload.user_id) targetUserIds.push(payload.user_id);
    if (payload.user_ids) targetUserIds.push(...payload.user_ids);

    // Get tokens from both profiles.fcm_token AND user_fcm_tokens
    const allTokens: { token: string; user_id: string }[] = [];

    if (targetUserIds.length > 0) {
      // From profiles
      const { data: profileTokens } = await supabase
        .from("profiles")
        .select("id, fcm_token")
        .in("id", targetUserIds)
        .not("fcm_token", "is", null);

      if (profileTokens) {
        for (const p of profileTokens) {
          if (p.fcm_token) allTokens.push({ token: p.fcm_token, user_id: p.id });
        }
      }

      // From user_fcm_tokens (may have additional tokens)
      const { data: extraTokens } = await supabase
        .from("user_fcm_tokens")
        .select("token, user_id")
        .in("user_id", targetUserIds);

      if (extraTokens) {
        for (const t of extraTokens) {
          if (!allTokens.find((a) => a.token === t.token)) {
            allTokens.push(t);
          }
        }
      }
    } else {
      // Broadcast to all
      const { data: tokens } = await supabase.from("user_fcm_tokens").select("token, user_id");
      if (tokens) allTokens.push(...tokens);
    }

    if (allTokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No tokens found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await getAccessToken(serviceAccount);

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const { token: fcmToken, user_id: recipientId } of allTokens) {
      try {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: fcmToken,
                // Data-only for web (triggers onMessage in foreground)
                data: {
                  title: payload.title,
                  body: payload.body,
                  route: payload.data?.route || "/",
                },
                // Android-specific: high priority + notification channel
                android: {
                  priority: "high",
                  notification: {
                    title: payload.title,
                    body: payload.body,
                    channel_id: "transpogest_critical",
                    default_sound: true,
                    default_vibrate_timings: true,
                    notification_priority: "PRIORITY_MAX",
                    visibility: "PUBLIC",
                  },
                },
              },
            }),
          }
        );

        if (res.ok) {
          sent++;
          // Log success
          await supabase.from("push_notifications_log").insert({
            recipient_user_id: recipientId,
            sender_user_id: callerId,
            title: payload.title,
            body: payload.body,
            data: payload.data || {},
            status: "sent",
            sent_at: new Date().toISOString(),
          });
        } else {
          const errBody = await res.text();
          failed++;
          errors.push(errBody);

          // Log failure
          await supabase.from("push_notifications_log").insert({
            recipient_user_id: recipientId,
            sender_user_id: callerId,
            title: payload.title,
            body: payload.body,
            data: payload.data || {},
            status: "failed",
            error_message: errBody.substring(0, 500),
          });

          // Clean up invalid tokens
          if (errBody.includes("UNREGISTERED") || errBody.includes("INVALID_ARGUMENT")) {
            await supabase.from("user_fcm_tokens").delete().eq("token", fcmToken);
            await supabase
              .from("profiles")
              .update({ fcm_token: null } as any)
              .eq("fcm_token", fcmToken);
          }
        }
      } catch (e) {
        failed++;
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, failed, errors: errors.slice(0, 5) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
