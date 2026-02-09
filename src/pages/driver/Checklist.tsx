import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const defaultChecklist = [
  { id: "oil", label: "Nível de óleo verificado" },
  { id: "tires", label: "Pneus em bom estado" },
  { id: "lights", label: "Luzes a funcionar" },
  { id: "brakes", label: "Travões OK" },
  { id: "mirrors", label: "Espelhos limpos e ajustados" },
  { id: "dashboard", label: "Dashboard sem alertas" },
  { id: "documents", label: "Documentos em dia" },
];

export default function Checklist() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [customForms, setCustomForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("dynamic_forms").select("*").then(({ data }) => {
      if (data) setCustomForms(data);
    });
  }, []);

  const toggle = (id: string) => {
    setChecks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    const { data: vehicle } = await supabase.from("vehicles").select("id").eq("current_driver_id", user?.id).maybeSingle();
    const { error } = await supabase.from("checklist_submissions").insert({
      driver_id: user?.id,
      vehicle_id: vehicle?.id || null,
      data: checks,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Checklist submetido com sucesso!");
      navigate("/motorista");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold">Checklist Diário</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Verificações Obrigatórias</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {defaultChecklist.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <Checkbox id={item.id} checked={checks[item.id] || false} onCheckedChange={() => toggle(item.id)} />
              <Label htmlFor={item.id} className="text-sm">{item.label}</Label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={handleSubmit} disabled={loading}>
        {loading ? "A submeter..." : "Submeter Checklist"}
      </Button>
    </div>
  );
}
