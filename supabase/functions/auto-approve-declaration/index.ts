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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Authenticate the calling driver
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("Invalid token");

    const { declaration_id, reason_code, reason_text, driver_signature_url, gps_lat, gps_lng, device_info, ip_address, liability_accepted } = await req.json();

    if (!declaration_id) throw new Error("declaration_id is required");
    if (!liability_accepted) throw new Error("Liability waiver must be accepted");
    if (gps_lat == null || gps_lng == null) throw new Error("GPS coordinates are mandatory");

    // 1. Verify declaration belongs to this driver
    const { data: decl, error: declError } = await supabaseAdmin
      .from("activity_declarations")
      .select("*")
      .eq("id", declaration_id)
      .eq("driver_id", user.id)
      .eq("status", "draft")
      .single();

    if (declError || !decl) throw new Error("Declaration not found or not accessible");

    // 2. Check if any manager is "online" (has been active in the last 15 minutes)
    const { data: managerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "manager"]);

    const managerIds = (managerRoles || []).map((r: any) => r.user_id);
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data: activeTokens } = await supabaseAdmin
      .from("user_fcm_tokens")
      .select("user_id")
      .in("user_id", managerIds)
      .gte("last_active_at", fifteenMinAgo);

    const managersOnline = (activeTokens || []).length > 0;

    // 3. Check if current time falls within any approval rule's active hours
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    // Find driver's group memberships
    const { data: memberships } = await supabaseAdmin
      .from("driver_group_members")
      .select("group_id")
      .eq("driver_id", user.id);

    const groupIds = (memberships || []).map((m: any) => m.group_id);

    let matchingRule: any = null;

    if (groupIds.length > 0) {
      const { data: rules } = await supabaseAdmin
        .from("approval_rules")
        .select("*")
        .in("driver_group_id", groupIds)
        .eq("is_active", true);

      for (const rule of rules || []) {
        // Check if reason is allowed
        if (reason_code && rule.allowed_reasons && rule.allowed_reasons.length > 0) {
          if (!rule.allowed_reasons.includes(reason_code)) continue;
        }

        // Check if current time is within active hours
        const start = rule.active_hours_start; // e.g. "20:00"
        const end = rule.active_hours_end; // e.g. "08:00"

        let isInActiveHours = false;
        if (start <= end) {
          // Normal range (e.g. 08:00 - 20:00)
          isInActiveHours = currentTime >= start && currentTime <= end;
        } else {
          // Overnight range (e.g. 20:00 - 08:00)
          isInActiveHours = currentTime >= start || currentTime <= end;
        }

        if (isInActiveHours) {
          matchingRule = rule;
          break;
        }
      }
    }

    // 4. Decision: if manager online AND no matching rule -> send standard notification
    if (managersOnline && !matchingRule) {
      return new Response(
        JSON.stringify({
          auto_approved: false,
          reason: "manager_online",
          message: "Um gestor está disponível. Notificação enviada.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. If no matching rule found at all -> cannot auto-approve
    if (!matchingRule) {
      return new Response(
        JSON.stringify({
          auto_approved: false,
          reason: "no_rule",
          message: "Nenhuma regra de auto-aprovação aplicável. Aguarde o gestor.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Auto-approve: apply manager's saved signature
    const managerSignatureUrl = matchingRule.digital_signature_url;
    if (!managerSignatureUrl) {
      return new Response(
        JSON.stringify({
          auto_approved: false,
          reason: "no_manager_signature",
          message: "Regra encontrada mas o gestor não tem assinatura configurada.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get manager profile
    const { data: managerProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", matchingRule.manager_id)
      .single();

    const managerName = managerProfile?.full_name || "Gestor (Auto-Aprovação)";
    const liabilityText = "Declaro sob compromisso de honra que estive em repouso. Assumo inteira responsabilidade legal por esta informação.";

    // Create audit log for auto-approval
    const { data: auditLog, error: auditError } = await supabaseAdmin
      .from("signature_audit_logs")
      .insert({
        declaration_id,
        signed_by_user_id: user.id,
        signer_role: "driver",
        signer_name: managerName,
        signed_at: new Date().toISOString(),
        gps_lat,
        gps_lng,
        device_info: device_info || "unknown",
        ip_address: ip_address || "unknown",
        signature_url: driver_signature_url,
        approval_type: "auto_approval",
        approval_rule_id: matchingRule.id,
        liability_accepted_at: new Date().toISOString(),
        liability_text: liabilityText,
      })
      .select("verification_id")
      .single();

    if (auditError) throw auditError;

    const verificationId = auditLog.verification_id;

    // Update the declaration (including gap_end_date to current timestamp)
    const { error: updateError } = await supabaseAdmin
      .from("activity_declarations")
      .update({
        status: "signed",
        reason_code,
        reason_text: reason_text || null,
        driver_signature_url,
        manager_signature_url: managerSignatureUrl,
        manager_name: `${managerName} (Auto)`,
        manager_id: matchingRule.manager_id,
        signed_at: new Date().toISOString(),
        signed_ip: ip_address,
        gap_end_date: new Date().toISOString(),
      })
      .eq("id", declaration_id);

    if (updateError) throw updateError;

    console.log(`[AUTO-APPROVE] Declaration ${declaration_id} auto-approved via rule ${matchingRule.id}`);

    return new Response(
      JSON.stringify({
        auto_approved: true,
        verification_id: verificationId,
        manager_name: managerName,
        message: "Declaração auto-aprovada com sucesso.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[AUTO-APPROVE] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
