import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, Search, CreditCard, AlertTriangle, MoreVertical, Trash2, Edit, UserCheck, UserX, Link2, UserPlus
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { format, differenceInDays } from "date-fns";
import { pt } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import TachographImport from "@/components/admin/TachographImport";

interface TachCard {
  id: string;
  card_number: string;
  driver_name: string | null;
  driver_id: string | null;
  expiry_date: string | null;
}

interface DriverProfile {
  id: string;
  full_name: string | null;
}

type FilterTab = "all" | "expiring" | "expired" | "unmapped";

export default function TachographCards() {
  const [cards, setCards] = useState<TachCard[]>([]);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<TachCard | null>(null);
  const [form, setForm] = useState({ card_number: "", driver_name: "", driver_id: "" as string, expiry_date: undefined as Date | undefined });
  const [createDriverOpen, setCreateDriverOpen] = useState(false);
  const [createDriverFor, setCreateDriverFor] = useState<string | null>(null); // card ID to auto-link after creation
  const [newDriver, setNewDriver] = useState({ full_name: "", email: "", password: "" });
  const [creatingDriver, setCreatingDriver] = useState(false);

  const fetchCards = async () => {
    const { data } = await supabase.from("tachograph_cards").select("*").order("driver_name");
    if (data) setCards(data);
  };

  const fetchDrivers = async () => {
    const { data } = await supabase.from("profiles").select("id, full_name").order("full_name");
    if (data) setDrivers(data);
  };

  useEffect(() => { fetchCards(); fetchDrivers(); }, []);

  const now = new Date();
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const getCardStatus = (c: TachCard) => {
    if (!c.expiry_date) return "ok";
    const exp = new Date(c.expiry_date);
    if (exp <= now) return "expired";
    if (exp <= in60Days) return "expiring";
    return "ok";
  };

  const expiringCount = cards.filter(c => getCardStatus(c) === "expiring").length;
  const expiredCount = cards.filter(c => getCardStatus(c) === "expired").length;
  const identifiedCount = cards.filter(c => c.driver_name).length;
  const unmappedCount = cards.filter(c => !c.driver_id).length;
  const mappedCount = cards.filter(c => c.driver_id).length;

  const filtered = cards.filter(c => {
    const matchSearch = !search ||
      c.card_number.toLowerCase().includes(search.toLowerCase()) ||
      (c.driver_name && c.driver_name.toLowerCase().includes(search.toLowerCase()));
    if (!matchSearch) return false;
    if (filterTab === "expiring") return getCardStatus(c) === "expiring";
    if (filterTab === "expired") return getCardStatus(c) === "expired";
    if (filterTab === "unmapped") return !c.driver_id;
    return true;
  });

  const handleSave = async () => {
    if (!form.card_number) { toast.error("Número do cartão é obrigatório"); return; }

    const payload: any = {
      card_number: form.card_number,
      driver_name: form.driver_name || null,
      expiry_date: form.expiry_date ? format(form.expiry_date, "yyyy-MM-dd") : null,
      driver_id: form.driver_id || null,
    };

    if (editingCard) {
      const { error } = await supabase.from("tachograph_cards").update(payload).eq("id", editingCard.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Cartão atualizado");
    } else {
      const { error } = await supabase.from("tachograph_cards").insert(payload);
      if (error) { toast.error(error.message.includes("duplicate") ? "Cartão já existe" : "Erro ao criar"); return; }
      toast.success("Cartão criado");
    }
    setDialogOpen(false);
    setEditingCard(null);
    setForm({ card_number: "", driver_name: "", driver_id: "", expiry_date: undefined });
    fetchCards();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("tachograph_cards").delete().eq("id", id);
    if (error) { toast.error("Erro ao eliminar"); return; }
    toast.success("Cartão eliminado");
    fetchCards();
  };

  const handleQuickMap = async (cardId: string, driverId: string | null) => {
    const { error } = await supabase.from("tachograph_cards").update({ driver_id: driverId }).eq("id", cardId);
    if (error) { toast.error("Erro ao mapear"); return; }
    toast.success(driverId ? "Motorista associado" : "Motorista removido");
    fetchCards();
  };

  const handleAutoMap = async () => {
    // Try to auto-map cards by matching driver_name with profiles.full_name
    let mapped = 0;
    const unmapped = cards.filter(c => !c.driver_id && c.driver_name);
    for (const card of unmapped) {
      const match = drivers.find(d =>
        d.full_name && card.driver_name &&
        d.full_name.toLowerCase().trim() === card.driver_name.toLowerCase().trim()
      );
      if (match) {
        const { error } = await supabase.from("tachograph_cards").update({ driver_id: match.id }).eq("id", card.id);
        if (!error) mapped++;
      }
    }
    toast.success(`${mapped} cartão(ões) mapeado(s) automaticamente`);
    fetchCards();
  };

  const openCreateDriver = (cardId?: string, prefillName?: string) => {
    setCreateDriverFor(cardId || null);
    setNewDriver({ full_name: prefillName || "", email: "", password: "" });
    setCreateDriverOpen(true);
  };

  const handleCreateDriver = async () => {
    if (!newDriver.full_name || !newDriver.email || !newDriver.password) {
      toast.error("Preencha todos os campos"); return;
    }
    if (newDriver.password.length < 6) {
      toast.error("Password deve ter pelo menos 6 caracteres"); return;
    }
    setCreatingDriver(true);
    try {
      const resp = await supabase.functions.invoke("create-driver", {
        body: { full_name: newDriver.full_name, email: newDriver.email, password: newDriver.password },
      });
      if (resp.error || !resp.data?.success) {
        toast.error(resp.data?.error || "Erro ao criar motorista");
        setCreatingDriver(false);
        return;
      }
      const newUserId = resp.data.user_id;
      toast.success(`Motorista "${newDriver.full_name}" criado com sucesso`);

      // Auto-link to card if we have one
      if (createDriverFor) {
        await supabase.from("tachograph_cards").update({ driver_id: newUserId }).eq("id", createDriverFor);
        toast.success("Cartão associado ao novo motorista");
      }

      // Also update form if dialog is open
      if (dialogOpen) {
        setForm(f => ({ ...f, driver_id: newUserId }));
      }

      setCreateDriverOpen(false);
      fetchDrivers();
      fetchCards();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar motorista");
    }
    setCreatingDriver(false);
  };

  const openEdit = (c: TachCard) => {
    setEditingCard(c);
    setForm({
      card_number: c.card_number,
      driver_name: c.driver_name || "",
      driver_id: c.driver_id || "",
      expiry_date: c.expiry_date ? new Date(c.expiry_date) : undefined,
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingCard(null);
    setForm({ card_number: "", driver_name: "", driver_id: "", expiry_date: undefined });
    setDialogOpen(true);
  };

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return null;
    return drivers.find(d => d.id === driverId)?.full_name || "Desconhecido";
  };

  const mappedPct = cards.length > 0 ? Math.round((mappedCount / cards.length) * 100) : 0;

  const tabs: { key: FilterTab; label: string; count: number; alert?: boolean }[] = [
    { key: "all", label: "Todos", count: cards.length },
    { key: "unmapped", label: "Sem Motorista", count: unmappedCount, alert: unmappedCount > 0 },
    { key: "expiring", label: "A Vencer", count: expiringCount, alert: expiringCount > 0 },
    { key: "expired", label: "Expirados", count: expiredCount, alert: expiredCount > 0 },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="page-header flex items-center gap-2">
          <CreditCard className="h-6 w-6" /> Cartões de Tacógrafo
        </h1>
        <p className="page-subtitle">Mapeamento entre números de cartão e motoristas</p>
      </div>

      {/* Summary card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Mapeamento a Perfis:</p>
              <p className="text-lg font-bold">{mappedPct}%</p>
              <p className="text-xs text-muted-foreground">{mappedCount} de {cards.length} cartões mapeados a motoristas</p>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="text-center">
                <UserCheck className="h-4 w-4 mx-auto text-success mb-1" />
                <span className="font-bold">{mappedCount}</span>
                <p className="text-xs text-muted-foreground">Mapeados</p>
              </div>
              <div className="text-center">
                <UserX className="h-4 w-4 mx-auto text-destructive mb-1" />
                <span className="font-bold">{unmappedCount}</span>
                <p className="text-xs text-muted-foreground">Sem perfil</p>
              </div>
            </div>
          </div>
          <Progress value={mappedPct} className="h-2" />

          {unmappedCount > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 border-warning text-warning">
                <Link2 className="h-3 w-3" /> {unmappedCount} cartão(ões) sem motorista associado
              </Badge>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAutoMap}>
                <Link2 className="h-3 w-3 mr-1" />Auto-mapear por nome
              </Button>
            </div>
          )}

          {expiredCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {expiredCount} cartão(ões) expirado(s)
            </Badge>
          )}
          {expiringCount > 0 && (
            <Badge variant="outline" className="gap-1 border-warning text-warning">
              <AlertTriangle className="h-3 w-3" /> {expiringCount} cartão(ões) a vencer (≤60 dias)
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Filter tabs */}
      <div className="flex items-center gap-3 text-sm border-b pb-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilterTab(tab.key)}
            className={`flex items-center gap-1.5 pb-1 font-medium transition-colors ${
              filterTab === tab.key ? "text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.alert && <AlertTriangle className="h-3 w-3" />}
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Search + Add */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Pesquisar por nome ou número..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <TachographImport onImportComplete={fetchCards} />
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="bg-success hover:bg-success/90"><Plus className="h-4 w-4" /></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCard ? "Editar Cartão" : "Novo Cartão"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label>Número do Cartão</Label><Input value={form.card_number} onChange={e => setForm(f => ({ ...f, card_number: e.target.value }))} placeholder="Ex: 19444950" /></div>
              <div><Label>Nome do Motorista</Label><Input value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} placeholder="Nome completo" /></div>
              <div>
                <Label>Perfil do Motorista (para sincronização)</Label>
                <Select value={form.driver_id} onValueChange={v => setForm(f => ({ ...f, driver_id: v === "none" ? "" : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar motorista..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem motorista —</SelectItem>
                    {drivers.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.full_name || "(Sem nome)"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[11px] text-muted-foreground flex-1">Ao associar, a sincronização Trackit atribui automaticamente este motorista ao veículo quando o cartão é inserido.</p>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => openCreateDriver(editingCard?.id, form.driver_name)}>
                    <UserPlus className="h-3 w-3 mr-1" />Novo Motorista
                  </Button>
                </div>
              </div>
              <div>
                <Label>Data de Validade</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.expiry_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.expiry_date ? format(form.expiry_date, "dd/MM/yyyy") : "Selecionar data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                    <Calendar
                      mode="single"
                      selected={form.expiry_date}
                      onSelect={(d) => setForm(f => ({ ...f, expiry_date: d }))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button onClick={handleSave} className="w-full">{editingCard ? "Guardar" : "Criar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número do Cartão</TableHead>
                <TableHead>Nome do Motorista</TableHead>
                <TableHead>Perfil Associado</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(c => {
                const status = getCardStatus(c);
                const driverName = getDriverName(c.driver_id);
                return (
                  <TableRow key={c.id} className={status === "expired" ? "bg-destructive/5" : status === "expiring" ? "bg-warning/5" : ""}>
                    <TableCell className="font-mono">
                      <div className="flex items-center gap-2">
                        {status === "expired" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                        {status === "expiring" && <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                        {c.card_number}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{c.driver_name || "—"}</TableCell>
                    <TableCell>
                      {c.driver_id ? (
                        <Badge variant="default" className="bg-success/10 text-success border-success/20 gap-1">
                          <UserCheck className="h-3 w-3" />{driverName}
                        </Badge>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Select onValueChange={v => handleQuickMap(c.id, v === "none" ? null : v)}>
                            <SelectTrigger className="h-7 text-xs w-[160px]">
                              <SelectValue placeholder="Associar..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— Nenhum —</SelectItem>
                              {drivers.map(d => (
                                <SelectItem key={d.id} value={d.id}>{d.full_name || "(Sem nome)"}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Criar novo motorista" onClick={() => openCreateDriver(c.id, c.driver_name || "")}>
                            <UserPlus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.expiry_date ? format(new Date(c.expiry_date), "dd/MM/yyyy") : "—"}
                      {c.expiry_date && status === "expiring" && (
                        <span className="text-xs text-warning ml-2">({differenceInDays(new Date(c.expiry_date), now)} dias)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(c)}><Edit className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                          {c.driver_id && (
                            <DropdownMenuItem onClick={() => handleQuickMap(c.id, null)}>
                              <UserX className="h-4 w-4 mr-2" />Remover Motorista
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleDelete(c.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Eliminar</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum cartão encontrado</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Driver Dialog */}
      <Dialog open={createDriverOpen} onOpenChange={setCreateDriverOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Criar Novo Motorista
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Nome Completo</Label>
              <Input value={newDriver.full_name} onChange={e => setNewDriver(f => ({ ...f, full_name: e.target.value }))} placeholder="Nome completo do motorista" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={newDriver.email} onChange={e => setNewDriver(f => ({ ...f, email: e.target.value }))} placeholder="motorista@empresa.pt" />
            </div>
            <div>
              <Label>Password Temporária</Label>
              <Input type="password" value={newDriver.password} onChange={e => setNewDriver(f => ({ ...f, password: e.target.value }))} placeholder="Mínimo 6 caracteres" />
              <p className="text-[11px] text-muted-foreground mt-1">O motorista poderá alterar a password após o primeiro login.</p>
            </div>
            <Button onClick={handleCreateDriver} disabled={creatingDriver} className="w-full">
              {creatingDriver ? "A criar..." : "Criar Motorista e Associar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
