import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ADMIN_PASSWORD = Deno.env.get("ADMIN_TEMP_PASSWORD");
    
    if (!ADMIN_PASSWORD) {
      throw new Error("ADMIN_TEMP_PASSWORD not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const email = "osadraque17@gmail.com";

    // Create user via admin API
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Administrador" },
    });

    if (createError) {
      // User might already exist
      if (createError.message?.includes("already")) {
        // Get user by email
        const { data: listData } = await supabase.auth.admin.listUsers();
        const existingUser = listData?.users?.find((u: any) => u.email === email);
        if (existingUser) {
          // Ensure admin role
          await supabase.from("user_roles").upsert(
            { user_id: existingUser.id, role: "admin" },
            { onConflict: "user_id" }
          );
          return new Response(
            JSON.stringify({ success: true, message: "User already exists, role updated to admin", user_id: existingUser.id }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      throw createError;
    }

    // Set role to admin
    if (userData?.user) {
      await supabase.from("user_roles").upsert(
        { user_id: userData.user.id, role: "admin" },
        { onConflict: "user_id" }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Admin user created", user_id: userData?.user?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("create-admin error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
