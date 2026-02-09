import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus, Search, CreditCard, AlertTriangle, MoreVertical, Trash2, Edit, RefreshCw
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

type FilterTab = "all" | "expiring" | "expired";

export default function TachographCards() {
  const [cards, setCards] = useState<TachCard[]>([]);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<TachCard | null>(null);
  const [form, setForm] = useState({ card_number: "", driver_name: "", expiry_date: undefined as Date | undefined });

  const fetchCards = async () => {
    const { data } = await supabase.from("tachograph_cards").select("*").order("driver_name");
    if (data) setCards(data);
  };

  useEffect(() => { fetchCards(); }, []);

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

  const filtered = cards.filter(c => {
    const matchSearch = !search ||
      c.card_number.toLowerCase().includes(search.toLowerCase()) ||
      (c.driver_name && c.driver_name.toLowerCase().includes(search.toLowerCase()));
    if (!matchSearch) return false;
    if (filterTab === "expiring") return getCardStatus(c) === "expiring";
    if (filterTab === "expired") return getCardStatus(c) === "expired";
    return true;
  });

  const handleSave = async () => {
    if (!form.card_number) { toast.error("Número do cartão é obrigatório"); return; }

    const payload = {
      card_number: form.card_number,
      driver_name: form.driver_name || null,
      expiry_date: form.expiry_date ? format(form.expiry_date, "yyyy-MM-dd") : null,
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
    setForm({ card_number: "", driver_name: "", expiry_date: undefined });
    fetchCards();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("tachograph_cards").delete().eq("id", id);
    if (error) { toast.error("Erro ao eliminar"); return; }
    toast.success("Cartão eliminado");
    fetchCards();
  };

  const openEdit = (c: TachCard) => {
    setEditingCard(c);
    setForm({
      card_number: c.card_number,
      driver_name: c.driver_name || "",
      expiry_date: c.expiry_date ? new Date(c.expiry_date) : undefined,
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingCard(null);
    setForm({ card_number: "", driver_name: "", expiry_date: undefined });
    setDialogOpen(true);
  };

  const identPct = cards.length > 0 ? Math.round((identifiedCount / cards.length) * 100) : 0;

  const tabs: { key: FilterTab; label: string; count: number; alert?: boolean }[] = [
    { key: "all", label: "Todos", count: cards.length },
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
              <p className="text-sm text-muted-foreground">Cobertura de Identificação:</p>
              <p className="text-lg font-bold">{identPct}%</p>
              <p className="text-xs text-muted-foreground">{identifiedCount} de {cards.length} cartões identificados</p>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="text-center">
                <CreditCard className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <span className="font-bold">{cards.length}</span>
                <p className="text-xs text-muted-foreground">Mapeamentos</p>
              </div>
              <div className="text-center">
                <span className="font-bold">{identifiedCount}</span>
                <p className="text-xs text-muted-foreground">Identificados</p>
              </div>
            </div>
          </div>
          <Progress value={identPct} className="h-2" />

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
                <Label>Data de Validade</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.expiry_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.expiry_date ? format(form.expiry_date, "dd/MM/yyyy") : "Selecionar data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
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
                <TableHead>Validade</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(c => {
                const status = getCardStatus(c);
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
                          <DropdownMenuItem onClick={() => handleDelete(c.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Eliminar</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum cartão encontrado</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
