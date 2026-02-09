import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ClipboardList, GripVertical, Eye, Pencil, Copy } from "lucide-react";
import { toast } from "sonner";

interface FormField {
  name: string;
  label: string;
  type: "text" | "checkbox" | "number" | "select" | "textarea";
  options?: string[];
  required?: boolean;
}

interface DynamicForm {
  id: string;
  title: string;
  schema: { fields?: FormField[] };
  created_at: string;
}

export default function FormBuilder() {
  const { user } = useAuth();
  const [forms, setForms] = useState<DynamicForm[]>([]);
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewForm, setPreviewForm] = useState<DynamicForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [fields, setFields] = useState<FormField[]>([
    { name: "field_1", label: "", type: "checkbox", required: false },
  ]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [optionsInput, setOptionsInput] = useState<Record<number, string>>({});

  const fetchForms = async () => {
    const { data } = await supabase.from("dynamic_forms").select("*").order("created_at", { ascending: false });
    if (data) setForms(data as DynamicForm[]);
  };

  useEffect(() => { fetchForms(); }, []);

  const resetForm = () => {
    setTitle("");
    setFields([{ name: "field_1", label: "", type: "checkbox", required: false }]);
    setEditingId(null);
    setOptionsInput({});
  };

  const addField = () => {
    setFields([...fields, { name: `field_${fields.length + 1}`, label: "", type: "checkbox", required: false }]);
  };

  const removeField = (i: number) => {
    setFields(fields.filter((_, idx) => idx !== i));
  };

  const updateField = (i: number, updates: Partial<FormField>) => {
    setFields(fields.map((f, idx) => idx === i ? { ...f, ...updates } : f));
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newFields = [...fields];
    const [dragged] = newFields.splice(dragIndex, 1);
    newFields.splice(index, 0, dragged);
    setFields(newFields);
    setDragIndex(index);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fields.some((f) => !f.label.trim())) {
      toast.error("Todos os campos devem ter um nome");
      return;
    }
    const schema = { fields: fields.map((f, i) => ({ ...f, name: `field_${i + 1}` })) };

    if (editingId) {
      const { error } = await supabase.from("dynamic_forms").update({ title, schema }).eq("id", editingId);
      if (error) toast.error(error.message);
      else {
        toast.success("Formulário atualizado");
        setOpen(false);
        resetForm();
        fetchForms();
      }
    } else {
      const { error } = await supabase.from("dynamic_forms").insert({ title, schema, created_by: user?.id });
      if (error) toast.error(error.message);
      else {
        toast.success("Formulário criado");
        setOpen(false);
        resetForm();
        fetchForms();
      }
    }
  };

  const handleEdit = (form: DynamicForm) => {
    setEditingId(form.id);
    setTitle(form.title);
    setFields(form.schema.fields || []);
    setOpen(true);
  };

  const handleDuplicate = async (form: DynamicForm) => {
    const { error } = await supabase.from("dynamic_forms").insert({
      title: `${form.title} (cópia)`,
      schema: form.schema as any,
      created_by: user?.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Formulário duplicado");
      fetchForms();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("dynamic_forms").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Formulário eliminado");
      fetchForms();
    }
  };

  const handlePreview = (form: DynamicForm) => {
    setPreviewForm(form);
    setPreviewOpen(true);
  };

  const fieldTypeLabels: Record<string, string> = {
    checkbox: "Checkbox",
    text: "Texto",
    number: "Número",
    select: "Seleção",
    textarea: "Texto Longo",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Formulários</h1>
          <p className="page-subtitle">Checklists e formulários dinâmicos para motoristas</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Novo Formulário</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Formulário" : "Criar Formulário"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label>Título do Formulário</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Ex: Checklist Diário" />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Campos</Label>
                  <span className="text-xs text-muted-foreground">Arraste para reordenar</span>
                </div>

                {fields.map((f, i) => (
                  <div
                    key={i}
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDragEnd={handleDragEnd}
                    className={`rounded-lg border p-3 space-y-2 transition-all ${dragIndex === i ? "opacity-50 border-primary" : "border-border"}`}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
                      <div className="flex-1">
                        <Input
                          value={f.label}
                          onChange={(e) => updateField(i, { label: e.target.value })}
                          placeholder="Nome do campo"
                          className="h-8 text-sm"
                        />
                      </div>
                      <Select value={f.type} onValueChange={(v) => updateField(i, { type: v as FormField["type"], options: v === "select" ? ["Opção 1"] : undefined })}>
                        <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="checkbox">Checkbox</SelectItem>
                          <SelectItem value="text">Texto</SelectItem>
                          <SelectItem value="number">Número</SelectItem>
                          <SelectItem value="select">Seleção</SelectItem>
                          <SelectItem value="textarea">Texto Longo</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <Label className="text-xs text-muted-foreground">Obrig.</Label>
                        <Switch
                          checked={f.required || false}
                          onCheckedChange={(v) => updateField(i, { required: v })}
                          className="scale-75"
                        />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeField(i)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    {f.type === "select" && (
                      <div className="ml-6 space-y-1">
                        <Label className="text-xs text-muted-foreground">Opções (separadas por vírgula)</Label>
                        <Input
                          className="h-7 text-xs"
                          placeholder="Bom, Razoável, Mau"
                          value={optionsInput[i] ?? (f.options?.join(", ") || "")}
                          onChange={(e) => {
                            setOptionsInput({ ...optionsInput, [i]: e.target.value });
                            updateField(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) });
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}

                <Button type="button" variant="outline" size="sm" onClick={addField} className="w-full">
                  <Plus className="mr-1 h-3 w-3" />Adicionar Campo
                </Button>
              </div>

              <Button type="submit" className="w-full">
                {editingId ? "Guardar Alterações" : "Criar Formulário"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Forms grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {forms.map((f) => (
          <Card key={f.id} className="group relative">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              <CardTitle className="text-base flex-1">{f.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {f.schema.fields?.slice(0, 3).map((field, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{field.label || "Sem nome"}</Badge>
                ))}
                {(f.schema.fields?.length || 0) > 3 && (
                  <Badge variant="outline" className="text-xs">+{(f.schema.fields?.length || 0) - 3}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{f.schema.fields?.length || 0} campos</p>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handlePreview(f)}>
                  <Eye className="mr-1 h-3 w-3" />Pré-visualizar
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleEdit(f)}>
                  <Pencil className="mr-1 h-3 w-3" />Editar
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleDuplicate(f)}>
                  <Copy className="mr-1 h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => handleDelete(f.id)}>
                  <Trash2 className="mr-1 h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {forms.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground py-8">Nenhum formulário criado</p>
        )}
      </div>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pré-visualização: {previewForm?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {previewForm?.schema.fields?.map((field, i) => (
              <div key={i} className="space-y-1">
                <Label className="text-sm">
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.type === "checkbox" && (
                  <div className="flex items-center gap-2">
                    <input type="checkbox" disabled className="h-4 w-4 rounded border" />
                    <span className="text-sm text-muted-foreground">Sim/Não</span>
                  </div>
                )}
                {field.type === "text" && <Input disabled placeholder="Texto..." />}
                {field.type === "number" && <Input disabled type="number" placeholder="0" />}
                {field.type === "textarea" && <textarea disabled className="w-full h-16 rounded-md border px-3 py-2 text-sm bg-muted" placeholder="Texto longo..." />}
                {field.type === "select" && (
                  <select disabled className="w-full h-9 rounded-md border px-3 text-sm bg-muted">
                    {field.options?.map((o, j) => <option key={j}>{o}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
