import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface FormField {
  name: string;
  label: string;
  type: "text" | "checkbox" | "number" | "select" | "textarea";
  options?: string[];
  required?: boolean;
}

const defaultChecklist: FormField[] = [
  { name: "oil", label: "Nível de óleo verificado", type: "checkbox" },
  { name: "tires", label: "Pneus em bom estado", type: "checkbox" },
  { name: "lights", label: "Luzes a funcionar", type: "checkbox" },
  { name: "brakes", label: "Travões OK", type: "checkbox" },
  { name: "mirrors", label: "Espelhos limpos e ajustados", type: "checkbox" },
  { name: "dashboard", label: "Dashboard sem alertas", type: "checkbox" },
  { name: "documents", label: "Documentos em dia", type: "checkbox" },
];

export default function Checklist() {
  const { user } = useAuth();
  const { enqueue } = useOfflineQueue();
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<string, any>>({});
  const [dynamicForms, setDynamicForms] = useState<{ id: string; title: string; fields: FormField[] }[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>("default");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("dynamic_forms").select("*").then(({ data }) => {
      if (data) {
        setDynamicForms(
          data.map((f: any) => ({
            id: f.id,
            title: f.title,
            fields: (f.schema as { fields?: FormField[] }).fields || [],
          }))
        );
      }
    });
  }, []);

  const activeFields = selectedFormId === "default"
    ? defaultChecklist
    : dynamicForms.find((f) => f.id === selectedFormId)?.fields || [];

  const updateValue = (name: string, value: any) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    for (const field of activeFields) {
      if (field.required && !values[field.name]) {
        toast.error(`O campo "${field.label}" é obrigatório`);
        return;
      }
    }

    setLoading(true);

    // Get vehicle if online
    let vehicleId: string | null = null;
    if (navigator.onLine) {
      const { data: vehicle } = await supabase.from("vehicles").select("id").eq("current_driver_id", user?.id).maybeSingle();
      vehicleId = vehicle?.id || null;
    }

    try {
      const success = await enqueue("checklist_submissions", {
        driver_id: user?.id,
        vehicle_id: vehicleId,
        form_id: selectedFormId === "default" ? null : selectedFormId,
        data: values,
      });
      if (success) {
        toast.success("Checklist submetido com sucesso!");
        navigate("/motorista");
      }
    } catch (err: any) {
      toast.error(err.message);
    }

    setLoading(false);
  };

  const renderField = (field: FormField) => {
    switch (field.type) {
      case "checkbox":
        return (
          <div key={field.name} className="flex items-center gap-3">
            <Checkbox
              id={field.name}
              checked={values[field.name] || false}
              onCheckedChange={(v) => updateValue(field.name, v)}
            />
            <Label htmlFor={field.name} className="text-sm">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
          </div>
        );
      case "text":
        return (
          <div key={field.name} className="space-y-1">
            <Label className="text-sm">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              value={values[field.name] || ""}
              onChange={(e) => updateValue(field.name, e.target.value)}
              placeholder={field.label}
            />
          </div>
        );
      case "number":
        return (
          <div key={field.name} className="space-y-1">
            <Label className="text-sm">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              type="number"
              value={values[field.name] || ""}
              onChange={(e) => updateValue(field.name, e.target.value)}
              placeholder="0"
            />
          </div>
        );
      case "textarea":
        return (
          <div key={field.name} className="space-y-1">
            <Label className="text-sm">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Textarea
              value={values[field.name] || ""}
              onChange={(e) => updateValue(field.name, e.target.value)}
              placeholder={field.label}
              rows={3}
            />
          </div>
        );
      case "select":
        return (
          <div key={field.name} className="space-y-1">
            <Label className="text-sm">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Select value={values[field.name] || ""} onValueChange={(v) => updateValue(field.name, v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                {field.options?.map((o, j) => <SelectItem key={j} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold">Checklist Diário</h1>

      {dynamicForms.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Formulário</Label>
          <Select value={selectedFormId} onValueChange={(v) => { setSelectedFormId(v); setValues({}); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Checklist Padrão</SelectItem>
              {dynamicForms.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selectedFormId === "default" ? "Verificações Obrigatórias" : dynamicForms.find((f) => f.id === selectedFormId)?.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeFields.map(renderField)}
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={handleSubmit} disabled={loading}>
        {loading ? "A submeter..." : "Submeter Checklist"}
      </Button>
    </div>
  );
}
