import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, MapPin, Users, Navigation, MoreVertical, Trash2, Edit, Filter } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Hub {
  id: string;
  client_id: string;
  name: string;
  code: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  client_name?: string;
}

interface Client {
  id: string;
  name: string;
  code: string;
}

export default function Hubs() {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHub, setEditingHub] = useState<Hub | null>(null);
  const [form, setForm] = useState({ name: "", code: "", client_id: "", address: "", lat: "", lng: "" });

  const fetchData = async () => {
    const [{ data: hubsData }, { data: clientsData }] = await Promise.all([
      supabase.from("hubs").select("*").order("name"),
      supabase.from("clients").select("id, name, code").order("name"),
    ]);
    if (clientsData) setClients(clientsData);
    if (hubsData && clientsData) {
      const clientMap: Record<string, string> = {};
      clientsData.forEach(c => { clientMap[c.id] = c.name; });
      setHubs(hubsData.map(h => ({ ...h, client_name: clientMap[h.client_id] || "—" })));
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = hubs.filter(h => {
    const matchSearch = !search ||
      h.name.toLowerCase().includes(search.toLowerCase()) ||
      h.code.toLowerCase().includes(search.toLowerCase()) ||
      (h.address && h.address.toLowerCase().includes(search.toLowerCase()));
    const matchClient = clientFilter === "all" || h.client_id === clientFilter;
    return matchSearch && matchClient;
  });

  const handleSave = async () => {
    if (!form.name || !form.code || !form.client_id) {
      toast.error("Nome, código e cliente são obrigatórios"); return;
    }

    const payload = {
      name: form.name,
      code: form.code,
      client_id: form.client_id,
      address: form.address || null,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
    };

    if (editingHub) {
      const { error } = await supabase.from("hubs").update(payload).eq("id", editingHub.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Hub atualizado");
    } else {
      const { error } = await supabase.from("hubs").insert(payload);
      if (error) { toast.error(error.message.includes("duplicate") ? "Código já existe" : "Erro ao criar"); return; }
      toast.success("Hub criado");
    }
    setDialogOpen(false);
    setEditingHub(null);
    setForm({ name: "", code: "", client_id: "", address: "", lat: "", lng: "" });
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("hubs").delete().eq("id", id);
    if (error) { toast.error("Erro ao eliminar"); return; }
    toast.success("Hub eliminado");
    fetchData();
  };

  const openEdit = (h: Hub) => {
    setEditingHub(h);
    setForm({
      name: h.name, code: h.code, client_id: h.client_id,
      address: h.address || "", lat: h.lat?.toString() || "", lng: h.lng?.toString() || "",
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingHub(null);
    setForm({ name: "", code: "", client_id: clients[0]?.id || "", address: "", lat: "", lng: "" });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="page-header">Hubs</h1>
        <p className="page-subtitle">Bases operacionais e pontos de entrega</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-lg">Hubs ({filtered.length})</span>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openNew} className="bg-success hover:bg-success/90">
                  <Plus className="h-4 w-4 mr-1" /> Novo Hub
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingHub ? "Editar Hub" : "Novo Hub"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Cliente</Label>
                    <Select value={form.client_id} onValueChange={v => setForm(f => ({ ...f, client_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                      <SelectContent>
                        {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Armazém Azambuja" /></div>
                  <div><Label>Código</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="Ex: AUCHAN-01-AA-02" /></div>
                  <div><Label>Morada</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Morada completa" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Latitude</Label><Input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="39.043168" /></div>
                    <div><Label>Longitude</Label><Input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} placeholder="-8.918766" /></div>
                  </div>
                  <Button onClick={handleSave} className="w-full">{editingHub ? "Guardar" : "Criar"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Pesquisar por nome, código ou morada..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {filtered.map(h => (
              <Card key={h.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-success" />
                        <span className="text-xs text-muted-foreground">{h.client_name}</span>
                      </div>
                      <p className="font-bold mt-0.5">{h.name}</p>
                      <p className="text-xs text-muted-foreground">{h.code}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(h)}><Edit className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(h.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Eliminar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {h.address && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />{h.address}
                    </div>
                  )}
                  {h.lat && h.lng && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                      <Navigation className="h-3.5 w-3.5" />{h.lat.toFixed(6)}, {h.lng.toFixed(6)}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground text-xs">
                      <Users className="h-3.5 w-3.5" />0 utilizadores
                    </span>
                    <Badge variant="default" className="bg-success/10 text-success border-success/20 hover:bg-success/20">Ativo</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Nenhum hub encontrado</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
