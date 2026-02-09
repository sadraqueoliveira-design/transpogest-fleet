import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ClipboardList } from "lucide-react";
import { toast } from "sonner";

interface FormField {
  name: string;
  label: string;
  type: "text" | "checkbox" | "number" | "select";
  options?: string[];
  required?: boolean;
}

export default function FormBuilder() {
  const { user } = useAuth();
  const [forms, setForms] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [fields, setFields] = useState<FormField[]>([
    { name: "field_1", label: "", type: "checkbox", required: false },
  ]);

  const fetchForms = async () => {
    const { data } = await supabase.from("dynamic_forms").select("*").order("created_at", { ascending: false });
    if (data) setForms(data);
  };

  useEffect(() => { fetchForms(); }, []);

  const addField = () => {
    setFields([...fields, { name: `field_${fields.length + 1}`, label: "", type: "checkbox", required: false }]);
  };

  const removeField = (i: number) => {
    setFields(fields.filter((_, idx) => idx !== i));
  };

  const updateField = (i: number, updates: Partial<FormField>) => {
    setFields(fields.map((f, idx) => idx === i ? { ...f, ...updates } : f));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const schema = { fields: fields.map((f, i) => ({ ...f, name: `field_${i + 1}` })) };
    const { error } = await supabase.from("dynamic_forms").insert({ title, schema, created_by: user?.id });
    if (error) toast.error(error.message);
    else {
      toast.success("Formulário criado");
      setOpen(false);
      setTitle("");
      setFields([{ name: "field_1", label: "", type: "checkbox", required: false }]);
      fetchForms();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Formulários</h1>
          <p className="page-subtitle">Checklists e formulários dinâmicos</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Novo Formulário</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Criar Formulário</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Ex: Checklist Diário" />
              </div>
              <div className="space-y-3">
                <Label>Campos</Label>
                {fields.map((f, i) => (
                  <div key={i} className="flex items-end gap-2 rounded-lg border p-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Nome do campo</Label>
                      <Input value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} placeholder="Ex: Nível de óleo OK" />
                    </div>
                    <div className="w-28 space-y-1">
                      <Label className="text-xs">Tipo</Label>
                      <Select value={f.type} onValueChange={(v) => updateField(i, { type: v as FormField["type"] })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="checkbox">Checkbox</SelectItem>
                          <SelectItem value="text">Texto</SelectItem>
                          <SelectItem value="number">Número</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => removeField(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addField}><Plus className="mr-1 h-3 w-3" />Adicionar Campo</Button>
              </div>
              <Button type="submit" className="w-full">Criar Formulário</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {forms.map((f) => {
          const schema = f.schema as { fields?: FormField[] };
          return (
            <Card key={f.id}>
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{f.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{schema.fields?.length || 0} campos</p>
              </CardContent>
            </Card>
          );
        })}
        {forms.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground py-8">Nenhum formulário criado</p>
        )}
      </div>
    </div>
  );
}
