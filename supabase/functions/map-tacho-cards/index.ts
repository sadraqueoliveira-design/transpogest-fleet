import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabase.auth.getUser(token);
    if (!caller) throw new Error("Invalid token");
    const { data: callerRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();
    if (!callerRole || callerRole.role !== "admin") throw new Error("Admin only");

    const { dry_run = true } = await req.json().catch(() => ({}));

    // Get unmapped cards
    const { data: cards } = await supabase
      .from("tachograph_cards")
      .select("id, card_number, driver_name")
      .is("driver_id", null);

    if (!cards?.length) {
      return new Response(JSON.stringify({ message: "No unmapped cards", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing profiles and employees
    const { data: profiles } = await supabase.from("profiles").select("id, full_name");
    const { data: employees } = await supabase.from("employees").select("id, full_name, profile_id, nif");

    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
    const profileMap = new Map((profiles || []).map(p => [normalize(p.full_name || ""), p.id]));
    const employeeMap = new Map((employees || []).map(e => [normalize(e.full_name || ""), e]));

    const defaultPassword = Deno.env.get("ADMIN_TEMP_PASSWORD") || "FleetSync2025!";

    const results: Array<{
      card_number: string;
      driver_name: string;
      action: string;
      driver_id?: string;
      email?: string;
    }> = [];

    for (const card of cards) {
      const name = card.driver_name || "";
      if (!name.trim()) {
        results.push({ card_number: card.card_number, driver_name: name, action: "skipped_no_name" });
        continue;
      }

      const key = normalize(name);

      // 1. Try match existing profile
      const profileId = profileMap.get(key);
      if (profileId) {
        if (!dry_run) {
          await supabase.from("tachograph_cards").update({ driver_id: profileId }).eq("id", card.id);
        }
        results.push({ card_number: card.card_number, driver_name: name, action: "matched_profile", driver_id: profileId });
        continue;
      }

      // 2. Try match employee with existing profile_id
      const emp = employeeMap.get(key);
      if (emp?.profile_id) {
        if (!dry_run) {
          await supabase.from("tachograph_cards").update({ driver_id: emp.profile_id }).eq("id", card.id);
        }
        results.push({ card_number: card.card_number, driver_name: name, action: "matched_employee_profile", driver_id: emp.profile_id });
        continue;
      }

      // 3. Create new auth user → trigger creates profile + role
      // Generate email from name: first.last@fleet.local
      const parts = name.trim().split(/\s+/);
      const first = parts[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const last = parts[parts.length - 1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      // Use NIF from employee if available, otherwise name-based
      const emailBase = emp?.nif || `${first}.${last}`;
      const email = `${emailBase}@fleet.local`;

      if (dry_run) {
        results.push({ card_number: card.card_number, driver_name: name, action: "will_create", email });
        continue;
      }

      // Check if email already exists
      const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 1 });
      
      try {
        const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: { full_name: name },
        });

        if (createErr) {
          // If email exists, try with card number suffix
          if (createErr.message?.includes("already")) {
            const altEmail = `${emailBase}.${card.card_number.slice(-4)}@fleet.local`;
            const { data: newUser2, error: createErr2 } = await supabase.auth.admin.createUser({
              email: altEmail,
              password: defaultPassword,
              email_confirm: true,
              user_metadata: { full_name: name },
            });
            if (createErr2) {
              results.push({ card_number: card.card_number, driver_name: name, action: "error", email: createErr2.message });
              continue;
            }
            const uid = newUser2.user!.id;
            await supabase.from("tachograph_cards").update({ driver_id: uid }).eq("id", card.id);
            // Link employee if matched
            if (emp) {
              await supabase.from("employees").update({ profile_id: uid }).eq("id", emp.id);
            }
            results.push({ card_number: card.card_number, driver_name: name, action: "created", driver_id: uid, email: altEmail });
          } else {
            results.push({ card_number: card.card_number, driver_name: name, action: "error", email: createErr.message });
          }
          continue;
        }

        const uid = newUser!.user!.id;
        await supabase.from("tachograph_cards").update({ driver_id: uid }).eq("id", card.id);
        // Link employee if matched
        if (emp) {
          await supabase.from("employees").update({ profile_id: uid }).eq("id", emp.id);
        }
        results.push({ card_number: card.card_number, driver_name: name, action: "created", driver_id: uid, email });
      } catch (err: any) {
        results.push({ card_number: card.card_number, driver_name: name, action: "error", email: err.message });
      }
    }

    const summary = {
      total: results.length,
      matched_profile: results.filter(r => r.action === "matched_profile").length,
      matched_employee: results.filter(r => r.action === "matched_employee_profile").length,
      created: results.filter(r => r.action === "created" || r.action === "will_create").length,
      errors: results.filter(r => r.action === "error").length,
      skipped: results.filter(r => r.action.startsWith("skipped")).length,
      dry_run,
    };

    return new Response(JSON.stringify({ summary, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
