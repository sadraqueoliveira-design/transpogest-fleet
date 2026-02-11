import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, User, Hash } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function DriverProfile() {
  const { user, profile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [licenseNumber, setLicenseNumber] = useState(profile?.license_number || "");
  const [employeeNumber, setEmployeeNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("employees").select("employee_number").eq("profile_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setEmployeeNumber(data.employee_number); });
  }, [user]);

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

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleUpdate} className="space-y-4">
            {employeeNumber !== null && (
              <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Nº Funcionário:</span>
                <span className="font-semibold">{employeeNumber}</span>
              </div>
            )}
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
