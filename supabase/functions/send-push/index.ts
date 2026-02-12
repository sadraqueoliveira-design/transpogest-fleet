const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PushPayload {
  user_ids?: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

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

  // Import the private key
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
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

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

    // Handle cases where the secret might be double-quoted or have extra escaping
    let cleanedJson = serviceAccountJson.trim();
    // If wrapped in outer quotes (e.g. "'{...}'" or '"{...}"'), unwrap
    if ((cleanedJson.startsWith('"') && cleanedJson.endsWith('"')) || 
        (cleanedJson.startsWith("'") && cleanedJson.endsWith("'"))) {
      cleanedJson = cleanedJson.slice(1, -1);
    }
    // Replace escaped newlines if present
    cleanedJson = cleanedJson.replace(/\\\\n/g, '\\n');
    
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(cleanedJson);
    } catch (parseErr) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT. First 50 chars:", cleanedJson.substring(0, 50));
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON. Please paste the full service account JSON file contents.");
    }
    const projectId = serviceAccount.project_id;

    // Verify caller is admin/manager
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabase.auth.getUser(token);
    if (!caller) throw new Error("Invalid token");

    const { data: callerRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!callerRole || !["admin", "manager"].includes(callerRole.role)) {
      throw new Error("Insufficient permissions");
    }

    const payload: PushPayload = await req.json();
    if (!payload.title || !payload.body) throw new Error("title and body are required");

    // Get FCM tokens
    let query = supabase.from("user_fcm_tokens").select("token, user_id");
    if (payload.user_ids && payload.user_ids.length > 0) {
      query = query.in("user_id", payload.user_ids);
    }
    const { data: tokens, error: tokensError } = await query;
    if (tokensError) throw tokensError;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No tokens found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get OAuth2 access token for FCM v1 API
    const accessToken = await getAccessToken(serviceAccount);

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 1500;

    for (const { token: fcmToken, user_id: recipientId } of tokens) {
      let lastError = "";
      let success = false;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
            console.log(`Retry ${attempt}/${MAX_RETRIES} for token ${fcmToken.substring(0, 8)}...`);
          }

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
                  data: {
                    title: payload.title,
                    body: payload.body,
                    route: payload.data?.route || "/",
                  },
                },
              }),
            }
          );

          if (res.ok) {
            sent++;
            success = true;
            await supabase.from("push_notifications_log").insert({
              recipient_user_id: recipientId,
              sender_user_id: caller.id,
              title: payload.title,
              body: payload.body,
              data: payload.data || {},
              status: "sent",
              sent_at: new Date().toISOString(),
            });
            break;
          } else {
            lastError = await res.text();
            // Non-retryable errors: invalid token
            if (lastError.includes("UNREGISTERED") || lastError.includes("INVALID_ARGUMENT")) {
              await supabase.from("user_fcm_tokens").delete().eq("token", fcmToken);
              break;
            }
            // Retryable: continue loop
          }
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
        }
      }

      if (!success) {
        failed++;
        errors.push(lastError);
        await supabase.from("push_notifications_log").insert({
          recipient_user_id: recipientId,
          sender_user_id: caller.id,
          title: payload.title,
          body: payload.body,
          data: payload.data || {},
          status: "failed",
          error_message: lastError.substring(0, 500),
        });
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
