import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Search, Building2, MapPin, Users, MoreVertical, Trash2, Edit, Wifi, WifiOff, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Client {
  id: string;
  name: string;
  code: string;
  nif: string | null;
  status: string;
  trackit_username: string | null;
  trackit_password: string | null;
  api_enabled: boolean;
  last_sync_at: string | null;
  hub_count?: number;
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState({
    name: "", code: "", nif: "",
    trackit_username: "", trackit_password: "", api_enabled: false,
  });
  const [testing, setTesting] = useState(false);

  const fetchClients = async () => {
    const { data: clientsData } = await supabase
      .from("clients")
      .select("*")
      .order("name");
    if (!clientsData) return;

    const { data: hubs } = await supabase.from("hubs").select("client_id");
    const hubCounts: Record<string, number> = {};
    hubs?.forEach(h => { hubCounts[h.client_id] = (hubCounts[h.client_id] || 0) + 1; });

    setClients(clientsData.map(c => ({
      ...c,
      hub_count: hubCounts[c.id] || 0,
    })) as Client[]);
  };

  useEffect(() => { fetchClients(); }, []);

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    (c.nif && c.nif.includes(search))
  );

  const handleSave = async () => {
    if (!form.name || !form.code) { toast.error("Nome e código são obrigatórios"); return; }

    const payload = {
      name: form.name,
      code: form.code,
      nif: form.nif || null,
      trackit_username: form.trackit_username || null,
      trackit_password: form.trackit_password || null,
      api_enabled: form.api_enabled,
    };

    if (editingClient) {
      const { error } = await supabase.from("clients").update(payload).eq("id", editingClient.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Cliente atualizado");
    } else {
      const { error } = await supabase.from("clients").insert(payload);
      if (error) { toast.error(error.message.includes("duplicate") ? "Código já existe" : "Erro ao criar"); return; }
      toast.success("Cliente criado");
    }
    setDialogOpen(false);
    setEditingClient(null);
    resetForm();
    fetchClients();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) { toast.error("Erro ao eliminar"); return; }
    toast.success("Cliente eliminado");
    fetchClients();
  };

  const resetForm = () => {
    setForm({ name: "", code: "", nif: "", trackit_username: "", trackit_password: "", api_enabled: false });
  };

  const openEdit = (c: Client) => {
    setEditingClient(c);
    setForm({
      name: c.name, code: c.code, nif: c.nif || "",
      trackit_username: c.trackit_username || "",
      trackit_password: c.trackit_password || "",
      api_enabled: c.api_enabled,
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingClient(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleTestConnection = async () => {
    if (!form.trackit_username || !form.trackit_password) {
      toast.error("Preencha o username e password antes de testar");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-trackit-connection", {
        body: { username: form.trackit_username, password: form.trackit_password },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Conexão OK — ${data.vehicle_count} veículo(s) encontrado(s)`);
      } else {
        toast.error(`Falha: ${data?.error || "Erro desconhecido"}`);
      }
    } catch (err: any) {
      toast.error("Erro ao testar: " + (err.message || "Desconhecido"));
    }
    setTesting(false);
  };

  const formatSync = (ts: string | null) => {
    if (!ts) return "Nunca";
    const d = new Date(ts);
    return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingClient ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome da empresa" /></div>
                  <div><Label>Código</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="Ex: AUCHAN-01" /></div>
                  <div><Label>NIF</Label><Input value={form.nif} onChange={e => setForm(f => ({ ...f, nif: e.target.value }))} placeholder="Número de contribuinte" /></div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">Integração Trackit</p>
                        <p className="text-xs text-muted-foreground">Sincronização GPS via API Trackit</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="api-toggle" className="text-xs text-muted-foreground">
                          {form.api_enabled ? "Ativo" : "Inativo"}
                        </Label>
                        <Switch
                          id="api-toggle"
                          checked={form.api_enabled}
                          onCheckedChange={v => setForm(f => ({ ...f, api_enabled: v }))}
                        />
                      </div>
                    </div>

                    <div>
                      <Label>API Username</Label>
                      <Input
                        value={form.trackit_username}
                        onChange={e => setForm(f => ({ ...f, trackit_username: e.target.value }))}
                        placeholder="Username Trackit"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <Label>API Password</Label>
                      <Input
                        type="password"
                        value={form.trackit_password}
                        onChange={e => setForm(f => ({ ...f, trackit_password: e.target.value }))}
                        placeholder="Password Trackit"
                        autoComplete="new-password"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 w-full"
                      onClick={handleTestConnection}
                      disabled={testing || !form.trackit_username || !form.trackit_password}
                    >
                      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                      {testing ? "A testar..." : "Testar Conexão"}
                    </Button>
                  </div>

                  <Separator />

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
                    {c.api_enabled ? (
                      <span className="flex items-center gap-1 text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span className="text-xs">Sync: {formatSync(c.last_sync_at)}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <WifiOff className="h-3.5 w-3.5" />
                        <span className="text-xs">API off</span>
                      </span>
                    )}
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
