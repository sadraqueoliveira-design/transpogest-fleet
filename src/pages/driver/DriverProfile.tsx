import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, User, Hash, CheckCircle, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function DriverProfile() {
  const { user, profile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [licenseNumber, setLicenseNumber] = useState(profile?.license_number || "");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [linkedEmployee, setLinkedEmployee] = useState<{ employee_number: number; full_name: string } | null>(null);
  const [linking, setLinking] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("employees").select("employee_number, full_name").eq("profile_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setLinkedEmployee(data);
          setEmployeeNumber(String(data.employee_number));
        }
      });
  }, [user]);

  const handleLinkEmployee = async () => {
    if (!user || !employeeNumber.trim()) return;
    const num = parseInt(employeeNumber.trim(), 10);
    if (isNaN(num)) { toast.error("Número inválido"); return; }

    setLinking(true);
    // Check if employee exists and is unlinked (or already linked to this user)
    const { data: emp, error } = await supabase
      .from("employees")
      .select("id, employee_number, full_name, profile_id")
      .eq("employee_number", num)
      .maybeSingle();

    if (error || !emp) {
      toast.error("Funcionário não encontrado com esse número");
      setLinking(false);
      return;
    }
    if (emp.profile_id && emp.profile_id !== user.id) {
      toast.error("Este número já está associado a outro utilizador");
      setLinking(false);
      return;
    }
    if (emp.profile_id === user.id) {
      setLinkedEmployee({ employee_number: emp.employee_number, full_name: emp.full_name });
      toast.info("Já está associado a este funcionário");
      setLinking(false);
      return;
    }

    // Unlink any previous employee from this profile
    await supabase.from("employees").update({ profile_id: null }).eq("profile_id", user.id);

    // Link this employee
    const { error: linkErr } = await supabase
      .from("employees")
      .update({ profile_id: user.id })
      .eq("id", emp.id);

    if (linkErr) {
      toast.error("Erro ao associar: " + linkErr.message);
    } else {
      setLinkedEmployee({ employee_number: emp.employee_number, full_name: emp.full_name });
      toast.success(`Associado ao funcionário ${emp.full_name} (nº ${emp.employee_number})`);
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

      <Button variant="outline" className="w-full text-destructive" onClick={signOut}>
        <LogOut className="mr-2 h-4 w-4" />Terminar Sessão
      </Button>
    </div>
  );
}
