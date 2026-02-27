import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, User, Hash, CheckCircle, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SignatureUpload from "@/components/admin/SignatureUpload";

export default function DriverProfile() {
  const { user, profile, role, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [licenseNumber, setLicenseNumber] = useState(profile?.license_number || "");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [linkedEmployee, setLinkedEmployee] = useState<{ employee_number: number; full_name: string } | null>(null);
  const [linking, setLinking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const isManagerOrAdmin = role === "admin" || role === "manager";

  useEffect(() => {
    if (!user) return;
    supabase.from("employees").select("employee_number, full_name").eq("profile_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setLinkedEmployee(data);
          setEmployeeNumber(String(data.employee_number));
        }
      });

    // Load existing signature URL for managers
    if (isManagerOrAdmin) {
      supabase.from("profiles").select("saved_signature_url").eq("id", user.id).maybeSingle()
        .then(async ({ data }) => {
          if (data?.saved_signature_url) {
            const { data: signed } = await supabase.storage
              .from("manager-signatures")
              .createSignedUrl(data.saved_signature_url, 60 * 60);
            if (signed) setSignatureUrl(signed.signedUrl);
          }
        });
    }
  }, [user, isManagerOrAdmin]);

  const handleLinkEmployee = async () => {
    if (!user || !employeeNumber.trim()) return;
    const num = parseInt(employeeNumber.trim(), 10);
    if (isNaN(num)) { toast.error("Número inválido"); return; }

    setLinking(true);
    const { data, error } = await supabase.rpc('link_real_account_to_employee', {
      p_employee_number: num
    });

    if (error) {
      toast.error("Erro ao associar: " + error.message);
      setLinking(false);
      return;
    }

    const result = data as { status?: string; error?: string; employee_name?: string; replaced_placeholder?: boolean };

    if (result.error === 'employee_not_found') {
      toast.error("Funcionário não encontrado com esse número");
    } else if (result.error === 'already_linked_real') {
      toast.error("Este número já está associado a outro utilizador");
    } else if (result.status === 'already_linked') {
      toast.info("Já está associado a este funcionário");
      // Refresh linked employee display
      const { data: emp } = await supabase.from("employees").select("employee_number, full_name").eq("profile_id", user.id).maybeSingle();
      if (emp) setLinkedEmployee(emp);
    } else if (result.status === 'linked') {
      const msg = result.replaced_placeholder
        ? `Conta real vinculada ao funcionário ${result.employee_name} (nº ${num}) — conta placeholder desativada`
        : `Associado ao funcionário ${result.employee_name} (nº ${num}) — perfil atualizado`;
      toast.success(msg);
      // Refresh profile data
      setFullName(result.employee_name || fullName);
      setLinkedEmployee({ employee_number: num, full_name: result.employee_name || "" });
      const { data: prof } = await supabase.from("profiles").select("license_number").eq("id", user.id).maybeSingle();
      if (prof?.license_number) setLicenseNumber(prof.license_number);
    }
    setLinking(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName, license_number: licenseNumber }).eq("id", user?.id);
    if (error) toast.error(error.message);
    else toast.success("Perfil atualizado");
    setLoading(false);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold flex items-center gap-2"><User className="h-5 w-5" />Perfil</h1>

      {/* Employee linking card */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Label className="flex items-center gap-1.5"><Hash className="h-4 w-4" />Nº de Funcionário</Label>
          {linkedEmployee ? (
            <div className="flex items-center gap-2 rounded-md bg-muted p-3">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span className="text-sm">
                Associado a <span className="font-semibold">{linkedEmployee.full_name}</span> (nº {linkedEmployee.employee_number})
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Introduza o seu número de funcionário para associar ao seu perfil.</p>
          )}
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Ex: 1234"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              disabled={linking}
            />
            <Button onClick={handleLinkEmployee} disabled={linking || !employeeNumber.trim()} variant={linkedEmployee ? "outline" : "default"}>
              {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : linkedEmployee ? "Atualizar" : "Associar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Profile form */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome Completo</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={user?.email || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Carta de Condução</Label>
              <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="Nº da carta de condução" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "A guardar..." : "Guardar Alterações"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Manager/Admin signature upload */}
      {isManagerOrAdmin && (
        <SignatureUpload
          currentUrl={signatureUrl}
          onSaved={(url) => setSignatureUrl(url)}
        />
      )}

      <Button variant="outline" className="w-full text-destructive" onClick={signOut}>
        <LogOut className="mr-2 h-4 w-4" />Terminar Sessão
      </Button>
    </div>
  );
}
