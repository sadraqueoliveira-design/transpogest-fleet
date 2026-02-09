import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Search, Building2, MapPin, Users, MoreVertical, Trash2, Edit } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Client {
  id: string;
  name: string;
  code: string;
  nif: string | null;
  status: string;
  hub_count?: number;
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState({ name: "", code: "", nif: "" });

  const fetchClients = async () => {
    const { data: clientsData } = await supabase.from("clients").select("*").order("name");
    if (!clientsData) return;

    // Get hub counts
    const { data: hubs } = await supabase.from("hubs").select("client_id");
    const hubCounts: Record<string, number> = {};
    hubs?.forEach(h => { hubCounts[h.client_id] = (hubCounts[h.client_id] || 0) + 1; });

    setClients(clientsData.map(c => ({ ...c, hub_count: hubCounts[c.id] || 0 })));
  };

  useEffect(() => { fetchClients(); }, []);

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    (c.nif && c.nif.includes(search))
  );

  const handleSave = async () => {
    if (!form.name || !form.code) { toast.error("Nome e código são obrigatórios"); return; }

    if (editingClient) {
      const { error } = await supabase.from("clients").update({
        name: form.name, code: form.code, nif: form.nif || null,
      }).eq("id", editingClient.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Cliente atualizado");
    } else {
      const { error } = await supabase.from("clients").insert({
        name: form.name, code: form.code, nif: form.nif || null,
      });
      if (error) { toast.error(error.message.includes("duplicate") ? "Código já existe" : "Erro ao criar"); return; }
      toast.success("Cliente criado");
    }
    setDialogOpen(false);
    setEditingClient(null);
    setForm({ name: "", code: "", nif: "" });
    fetchClients();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) { toast.error("Erro ao eliminar"); return; }
    toast.success("Cliente eliminado");
    fetchClients();
  };

  const openEdit = (c: Client) => {
    setEditingClient(c);
    setForm({ name: c.name, code: c.code, nif: c.nif || "" });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingClient(null);
    setForm({ name: "", code: "", nif: "" });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="page-header">Clientes</h1>
        <p className="page-subtitle">Gestão de empresas clientes</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-lg">Clientes ({filtered.length})</span>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openNew} className="bg-success hover:bg-success/90">
                  <Plus className="h-4 w-4 mr-1" /> Novo Cliente
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingClient ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome da empresa" /></div>
                  <div><Label>Código</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="Ex: AUCHAN-01" /></div>
                  <div><Label>NIF</Label><Input value={form.nif} onChange={e => setForm(f => ({ ...f, nif: e.target.value }))} placeholder="Número de contribuinte" /></div>
                  <Button onClick={handleSave} className="w-full">{editingClient ? "Guardar" : "Criar"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Pesquisar por nome, NIF ou código..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="space-y-3">
            {filtered.map(c => (
              <Card key={c.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-success/10 text-success">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-bold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.code}</p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(c)}><Edit className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(c.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Eliminar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{c.hub_count} hubs</span>
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />0</span>
                    <Badge variant="default" className="ml-auto bg-success/10 text-success border-success/20 hover:bg-success/20">Ativo</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Nenhum cliente encontrado</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
