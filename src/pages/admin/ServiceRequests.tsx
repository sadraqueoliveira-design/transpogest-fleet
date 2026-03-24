import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Check, X, Plus, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";

const typeMap: Record<string, string> = {
  Uniform: "Fardamento",
  Vacation: "Férias",
  Absence: "Falta",
  JustifiedAbsence: "Falta Justificada",
  DayOff: "Folga",
  SickLeave: "Baixa Médica",
  Insurance: "Seguro",
  Document: "Documento",
  Other: "Outro",
};

const absenceTypes = [
  { value: "Vacation", label: "Férias" },
  { value: "Absence", label: "Falta" },
  { value: "JustifiedAbsence", label: "Falta Justificada" },
  { value: "DayOff", label: "Folga" },
  { value: "SickLeave", label: "Baixa Médica" },
  { value: "Insurance", label: "Seguro" },
  { value: "Other", label: "Outro" },
];

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  pending: { label: "Pendente", variant: "default" },
  approved: { label: "Aprovado", variant: "secondary" },
  rejected: { label: "Rejeitado", variant: "destructive" },
};

function formatDetails(details: any, type: string): string {
  if (!details) return "—";
  const parts: string[] = [];
  if (details.reason) parts.push(details.reason);
  if (details.start_date && details.end_date) parts.push(`${details.start_date} → ${details.end_date}`);
  else if (details.start_date) parts.push(`Início: ${details.start_date}`);
  if (details.size) parts.push(`Tamanho: ${details.size}`);
  if (details.notes) parts.push(details.notes);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export default function ServiceRequests() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [drivers, setDrivers] = useState<{ id: string; full_name: string }[]>([]);
  const [newReq, setNewReq] = useState({ driver_id: "", type: "", reason: "", notes: "" });
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [submitting, setSubmitting] = useState(false);

  const fetchDrivers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name");
    if (data) setDrivers(data.filter((d) => d.full_name));
  };

  const fetchRequests = async () => {
    const { data } = await supabase
      .from("service_requests")
      .select("*, profiles:driver_id(full_name)")
      .order("created_at", { ascending: false });
    if (data) setRequests(data);
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); fetchDrivers(); }, []);

  const selectFullMonth = () => {
    const days = eachDayOfInterval({ start: startOfMonth(calendarMonth), end: endOfMonth(calendarMonth) });
    setSelectedDates(days);
  };

  const selectWeekdays = () => {
    const days = eachDayOfInterval({ start: startOfMonth(calendarMonth), end: endOfMonth(calendarMonth) });
    setSelectedDates(days.filter((d) => getDay(d) !== 0 && getDay(d) !== 6));
  };

  const selectWeekends = () => {
    const days = eachDayOfInterval({ start: startOfMonth(calendarMonth), end: endOfMonth(calendarMonth) });
    setSelectedDates(days.filter((d) => getDay(d) === 0 || getDay(d) === 6));
  };

  const handleCreate = async () => {
    if (!newReq.driver_id || !newReq.type) {
      toast.error("Selecione o motorista e o tipo");
      return;
    }
    if (selectedDates.length === 0) {
      toast.error("Selecione pelo menos uma data");
      return;
    }
    setSubmitting(true);
    const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());
    const dateStrings = sortedDates.map((d) => format(d, "yyyy-MM-dd"));

    const details: any = {};
    details.start_date = dateStrings[0];
    if (dateStrings.length > 1) {
      details.end_date = dateStrings[dateStrings.length - 1];
      details.selected_dates = dateStrings;
    }
    if (newReq.reason) details.reason = newReq.reason;
    if (newReq.notes) details.notes = newReq.notes;
    details.total_days = dateStrings.length;

    const { error } = await supabase.from("service_requests").insert({
      driver_id: newReq.driver_id,
      type: newReq.type as any,
      status: "approved",
      details,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${dateStrings.length} dia(s) registado(s) com sucesso`);
      setShowCreate(false);
      setNewReq({ driver_id: "", type: "", reason: "", notes: "" });
      setSelectedDates([]);
      fetchRequests();
    }
  };

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("service_requests").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(status === "approved" ? "Aprovado" : "Rejeitado");
      fetchRequests();
    }
  };

  const getAttachments = (details: any): string[] => {
    if (!details?.attachments) return [];
    return Array.isArray(details.attachments) ? details.attachments : [];
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Solicitações</h1>
          <p className="page-subtitle">Pedidos dos motoristas</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Registo
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motorista</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Detalhes</TableHead>
                <TableHead>Anexos</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">A carregar...</TableCell></TableRow>
              ) : requests.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sem solicitações</TableCell></TableRow>
              ) : (
                requests.map((r) => {
                  const atts = getAttachments(r.details);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{(r.profiles as any)?.full_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{typeMap[r.type] || r.type}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[250px]">
                        <span className="text-sm text-muted-foreground line-clamp-2">
                          {formatDetails(r.details, r.type)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {atts.length > 0 ? (
                          <div className="flex gap-1 items-center">
                            {atts.slice(0, 3).map((url: string, i: number) => (
                              <button
                                key={i}
                                onClick={() => setPreviewUrl(url)}
                                className="relative h-8 w-8 rounded border border-border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                              >
                                <img src={url} alt="" className="h-full w-full object-cover" />
                              </button>
                            ))}
                            {atts.length > 3 && (
                              <span className="text-xs text-muted-foreground">+{atts.length - 3}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusMap[r.status]?.variant}>{statusMap[r.status]?.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.status === "pending" && (
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => updateStatus(r.id, "approved")}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => updateStatus(r.id, "rejected")}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Comprovativo</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <img src={previewUrl} alt="Comprovativo" className="w-full rounded-md" />
          )}
        </DialogContent>
      </Dialog>

      {/* Create absence dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Registo de Ausência</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motorista</Label>
              <Select value={newReq.driver_id} onValueChange={(v) => setNewReq({ ...newReq, driver_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar motorista" /></SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={newReq.type} onValueChange={(v) => setNewReq({ ...newReq, type: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar tipo" /></SelectTrigger>
                <SelectContent>
                  {absenceTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Calendar with batch selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Selecionar Dias
              </Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <Button type="button" size="sm" variant="outline" className="text-xs h-7" onClick={selectFullMonth}>
                  Mês inteiro
                </Button>
                <Button type="button" size="sm" variant="outline" className="text-xs h-7" onClick={selectWeekdays}>
                  Dias úteis
                </Button>
                <Button type="button" size="sm" variant="outline" className="text-xs h-7" onClick={selectWeekends}>
                  Fins de semana
                </Button>
                <Button type="button" size="sm" variant="ghost" className="text-xs h-7 text-destructive" onClick={() => setSelectedDates([])}>
                  Limpar
                </Button>
              </div>
              <div className="flex justify-center border rounded-lg p-1 bg-muted/30">
                <Calendar
                  mode="multiple"
                  selected={selectedDates}
                  onSelect={(dates) => setSelectedDates(dates || [])}
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  locale={pt}
                  className={cn("p-3 pointer-events-auto")}
                />
              </div>
              {selectedDates.length > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  {selectedDates.length} dia(s) selecionado(s)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input value={newReq.reason} onChange={(e) => setNewReq({ ...newReq, reason: e.target.value })} placeholder="Ex: Folga semanal" />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={newReq.notes} onChange={(e) => setNewReq({ ...newReq, notes: e.target.value })} placeholder="Observações adicionais..." rows={2} />
            </div>
            <Button onClick={handleCreate} disabled={submitting} className="w-full">
              {submitting ? "A guardar..." : `Criar Registo (${selectedDates.length} dia${selectedDates.length !== 1 ? "s" : ""})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
