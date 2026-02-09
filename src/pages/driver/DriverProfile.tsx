import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, User } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function DriverProfile() {
  const { user, profile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [loading, setLoading] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user?.id);
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
            <div className="space-y-2">
              <Label>Nome Completo</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={user?.email || ""} disabled />
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
