import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ImportButton, ExportButton } from "@/components/admin/BulkImportExport";
import { ScheduleExportDialog, ScheduleImportDialog } from "@/components/admin/MaintenanceImportExport";
import { Search, AlertTriangle, CheckCircle, Clock, Wrench, CalendarDays, Droplets, Shield, Thermometer, Gauge, Upload, Download } from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";

const CATEGORIES = [
  { key: "Revisão KM", label: "Revisão KM", icon: Gauge, short: "Rev. KM" },
  { key: "Revisão Anual", label: "Revisão Anual", icon: CalendarDays, short: "Rev. Anual" },
  { key: "IPO", label: "IPO", icon: Shield, short: "IPO" },
  { key: "Revisão Frio", label: "Revisão Frio", icon: Thermometer, short: "Frio" },
  { key: "Tacógrafo", label: "Tacógrafo", icon: Clock, short: "Tacóg." },
  { key: "ATP", label: "ATP", icon: Shield, short: "ATP" },
  { key: "Lavagem", label: "Lavagem", icon: Droplets, short: "Lavagem" },
  { key: "Revisão Horas", label: "Revisão Horas", icon: Clock, short: "Rev. Horas" },
] as const;

type ScheduleRow = {
  id: string;
  vehicle_id: string;
  category: string;
  next_due_date: string | null;
  next_due_km: number | null;
  next_due_hours: number | null;
  last_service_date: string | null;
  last_service_km: number | null;
};

type Vehicle = {
  id: string;
  plate: string;
  odometer_km: number | null;
  engine_hours: number | null;
};

type MaintenanceRecord = {
  id: string;
  vehicle_id: string;
  type: string;
  description: string | null;
  cost: number | null;
  status: string;
  date_scheduled: string | null;
  created_at: string;
  vehicles: { plate: string } | null;
};

const ALIASES: Record<string, string[]> = {
  plate: ["plate", "matrícula", "matricula", "veículo", "veiculo"],
  type: ["type", "tipo"],
  description: ["description", "descrição", "descricao"],
  cost: ["cost", "custo", "valor"],
  status: ["status", "estado"],
  date_scheduled: ["date_scheduled", "data", "data agendada"],
};

type ScheduleStatus = "expired" | "urgent" | "upcoming" | "ok";

function getScheduleDaysRemaining(schedule: ScheduleRow): number | null {
  if (schedule.category === "lavagem" && schedule.last_service_date) {
    return 30 - differenceInDays(new Date(), parseISO(schedule.last_service_date));
  }

  if (schedule.next_due_date) {
    return differenceInDays(parseISO(schedule.next_due_date), new Date());
  }

  return null;
}

function getScheduleStatus(daysRemaining: number | null): ScheduleStatus | null {
  if (daysRemaining === null) return null;
  if (daysRemaining < 0) return "expired";
  if (daysRemaining <= 30) return "urgent";
  if (daysRemaining <= 90) return "upcoming";
  return "ok";
}

function getDaysStatus(daysRemaining: number | null): { color: string; label: string } {
  if (daysRemaining === null) return { color: "bg-muted text-muted-foreground", label: "—" };
  if (daysRemaining < 0) return { color: "bg-destructive/20 text-destructive border-destructive/30", label: "Expirado" };
  if (daysRemaining <= 15) return { color: "bg-destructive/15 text-destructive border-destructive/20", label: "Crítico" };
  if (daysRemaining <= 30) return { color: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400", label: "Urgente" };
  if (daysRemaining <= 90) return { color: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400", label: "Próximo" };
  return { color: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400", label: "OK" };
}

function ScheduleCell({ 
  schedule, 
  vehicle, 
  category, 
  onEdit 
}: { 
  schedule: ScheduleRow | undefined; 
  vehicle: Vehicle;
  category: typeof CATEGORIES[number];
  onEdit: (vehicleId: string, category: string, current: ScheduleRow | undefined) => void;
}) {
  if (!schedule) {
    return (
      <TableCell 
        className="text-center cursor-pointer hover:bg-muted/50 transition-colors p-2"
        onClick={() => onEdit(vehicle.id, category.key, undefined)}
      >
        <span className="text-muted-foreground text-xs">—</span>
      </TableCell>
    );
  }

  const isLavagem = category.key === "Lavagem";
  const isHours = category.key === "Revisão Horas";
  
  let daysRemaining: number | null = null;
  let displayValue = "—";

  if (isLavagem && schedule.last_service_date) {
    const daysSince = differenceInDays(new Date(), parseISO(schedule.last_service_date));
    daysRemaining = 30 - daysSince; // assume 30 day wash cycle
    displayValue = format(parseISO(schedule.last_service_date), "dd/MM/yy");
  } else if (isHours && schedule.next_due_hours) {
    const currentHours = vehicle.engine_hours || 0;
    const hoursRemaining = schedule.next_due_hours - currentHours;
    // Convert hours to approximate days (assume ~8h/day usage)
    daysRemaining = Math.round(hoursRemaining / 8);
    displayValue = `${schedule.next_due_hours.toLocaleString()}h`;
  } else if (schedule.next_due_date) {
    daysRemaining = differenceInDays(parseISO(schedule.next_due_date), new Date());
    displayValue = format(parseISO(schedule.next_due_date), "dd/MM/yy");
  }

  const status = getDaysStatus(daysRemaining);

  return (
    <TableCell 
      className={`text-center cursor-pointer transition-colors p-1 border ${status.color}`}
      onClick={() => onEdit(vehicle.id, category.key, schedule)}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs font-medium">{displayValue}</span>
        {daysRemaining !== null && (
          <span className="text-[10px] opacity-80">
            {daysRemaining < 0 ? `${Math.abs(daysRemaining)}d atrás` : `${daysRemaining}d`}
          </span>
        )}
        {category.key === "Revisão KM" && schedule.next_due_km && (
          <span className="text-[10px] opacity-60">
            {(schedule.next_due_km / 1000).toFixed(0)}k km
          </span>
        )}
      </div>
    </TableCell>
  );
}

export default function Maintenance() {
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [vehicleMap, setVehicleMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState<"all" | ScheduleStatus>("all");
  const [editDialog, setEditDialog] = useState<{
    vehicleId: string;
    category: string;
    current?: ScheduleRow;
  } | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editKm, setEditKm] = useState("");
  const [editHours, setEditHours] = useState("");
  const [saving, setSaving] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const fetchData = async () => {
    const [{ data: sData }, { data: vData }, { data: mData }] = await Promise.all([
      supabase.from("vehicle_maintenance_schedule").select("*"),
      supabase.from("vehicles").select("id, plate, odometer_km, engine_hours").order("plate"),
      supabase.from("maintenance_records").select("*, vehicles(plate)").order("created_at", { ascending: false }).limit(100),
    ]);
    if (sData) setSchedules(sData as any);
    if (vData) {
      setVehicles(vData);
      const map: Record<string, string> = {};
      vData.forEach(v => { map[v.plate.replace(/[\s-]/g, "").toUpperCase()] = v.id; });
      setVehicleMap(map);
    }
    if (mData) setRecords(mData as any);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Build schedule lookup: vehicleId -> category -> ScheduleRow
  const scheduleLookup = useMemo(() => {
    const lookup: Record<string, Record<string, ScheduleRow>> = {};
    schedules.forEach(s => {
      if (!lookup[s.vehicle_id]) lookup[s.vehicle_id] = {};
      lookup[s.vehicle_id][s.category] = s;
    });
    return lookup;
  }, [schedules]);

  // Filter vehicles that have schedule data, match search and optional status filter
  const filteredVehicles = useMemo(() => {
    const vehiclesWithSchedule = vehicles.filter(v => scheduleLookup[v.id]);
    const q = search.trim().toLowerCase();

    return vehiclesWithSchedule.filter((vehicle) => {
      const matchesSearch = !q || vehicle.plate.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (activeStatusFilter === "all") return true;

      const vehicleSchedules = Object.values(scheduleLookup[vehicle.id] || {});
      return vehicleSchedules.some((schedule) => {
        const daysRemaining = getScheduleDaysRemaining(schedule);
        return getScheduleStatus(daysRemaining) === activeStatusFilter;
      });
    });
  }, [vehicles, scheduleLookup, search, activeStatusFilter]);

  // Summary stats
  const stats = useMemo(() => {
    let expired = 0, urgent = 0, upcoming = 0, ok = 0;

    schedules.forEach((schedule) => {
      const status = getScheduleStatus(getScheduleDaysRemaining(schedule));
      if (status === "expired") expired++;
      else if (status === "urgent") urgent++;
      else if (status === "upcoming") upcoming++;
      else if (status === "ok") ok++;
    });

    return { expired, urgent, upcoming, ok };
  }, [schedules]);

  const handleEdit = (vehicleId: string, category: string, current?: ScheduleRow) => {
    setEditDialog({ vehicleId, category, current });
    setEditDate(current?.next_due_date || current?.last_service_date || "");
    setEditKm(current?.next_due_km?.toString() || "");
    setEditHours(current?.next_due_hours?.toString() || "");
  };

  const handleCardFilter = (filter: ScheduleStatus) => {
    setActiveStatusFilter((prev) => (prev === filter ? "all" : filter));
  };

  const handleSave = async () => {
    if (!editDialog) return;
    setSaving(true);
    const isLavagem = editDialog.category === "Lavagem";

    if (editDialog.current) {
      const updates: Record<string, any> = {};
      if (isLavagem) { updates.last_service_date = editDate || null; }
      else { updates.next_due_date = editDate || null; }
      updates.next_due_km = editKm ? parseInt(editKm) : null;
      updates.next_due_hours = editHours ? parseInt(editHours) : null;
      const { error } = await supabase
        .from("vehicle_maintenance_schedule")
        .update(updates)
        .eq("id", editDialog.current.id);
      if (error) { toast.error("Erro ao atualizar"); setSaving(false); return; }
    } else {
      const { error } = await supabase
        .from("vehicle_maintenance_schedule")
        .insert({
          vehicle_id: editDialog.vehicleId,
          category: editDialog.category,
          next_due_date: isLavagem ? null : (editDate || null),
          last_service_date: isLavagem ? (editDate || null) : null,
          next_due_km: editKm ? parseInt(editKm) : null,
          next_due_hours: editHours ? parseInt(editHours) : null,
        });
      if (error) { toast.error("Erro ao criar"); setSaving(false); return; }
    }

    toast.success("Atualizado com sucesso");
    setSaving(false);
    setEditDialog(null);
    fetchData();
  };

  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
    pending: { label: "Pendente", variant: "destructive" },
    in_progress: { label: "Em Curso", variant: "default" },
    completed: { label: "Concluído", variant: "secondary" },
  };

  const exportData = records.map(r => ({
    Veículo: (r.vehicles as any)?.plate || "", Tipo: r.type === "preventive" ? "Preventiva" : "Corretiva",
    Descrição: r.description || "", Custo: r.cost ?? "", Estado: statusMap[r.status]?.label || r.status,
  }));

  const handleImport = async (rows: Record<string, string>[]) => {
    const payload = rows.map(r => {
      const normalizedPlate = (r.plate || "").replace(/[\s-]/g, "").toUpperCase();
      return {
        vehicle_id: vehicleMap[normalizedPlate] || "",
        type: (r.type?.toLowerCase().includes("preventiv") ? "preventive" : "corrective") as "preventive" | "corrective",
        description: r.description || null,
        cost: r.cost ? parseFloat(r.cost) : null,
        status: (r.status?.toLowerCase().includes("conclu") ? "completed" : r.status?.toLowerCase().includes("curso") ? "in_progress" : "pending") as any,
        date_scheduled: r.date_scheduled || null,
      };
    }).filter(p => p.vehicle_id);

    if (payload.length === 0) { toast.error("Nenhuma matrícula corresponde a veículos existentes"); return; }
    const { error } = await supabase.from("maintenance_records").insert(payload);
    if (error) throw error;
    toast.success(`${payload.length} registo(s) importado(s)`);
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="page-header flex items-center gap-2"><Wrench className="h-6 w-6" /> Manutenção</h1>
          <p className="page-subtitle">Planeamento e registos de manutenção da frota</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          className={`border-destructive/30 bg-destructive/5 cursor-pointer transition-all ${activeStatusFilter === "expired" ? "ring-2 ring-destructive" : ""}`}
          onClick={() => handleCardFilter("expired")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-2xl font-bold text-destructive">{stats.expired}</p>
              <p className="text-xs text-muted-foreground">Expirados</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`border-orange-300/50 bg-orange-50 dark:bg-orange-900/10 cursor-pointer transition-all ${activeStatusFilter === "urgent" ? "ring-2 ring-primary" : ""}`}
          onClick={() => handleCardFilter("urgent")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-orange-600" />
            <div>
              <p className="text-2xl font-bold text-orange-600">{stats.urgent}</p>
              <p className="text-xs text-muted-foreground">Urgentes (&lt;30d)</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`border-yellow-300/50 bg-yellow-50 dark:bg-yellow-900/10 cursor-pointer transition-all ${activeStatusFilter === "upcoming" ? "ring-2 ring-primary" : ""}`}
          onClick={() => handleCardFilter("upcoming")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <CalendarDays className="h-8 w-8 text-yellow-600" />
            <div>
              <p className="text-2xl font-bold text-yellow-600">{stats.upcoming}</p>
              <p className="text-xs text-muted-foreground">Próximos (&lt;90d)</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`border-emerald-300/50 bg-emerald-50 dark:bg-emerald-900/10 cursor-pointer transition-all ${activeStatusFilter === "ok" ? "ring-2 ring-primary" : ""}`}
          onClick={() => handleCardFilter("ok")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
            <div>
              <p className="text-2xl font-bold text-emerald-600">{stats.ok}</p>
              <p className="text-xs text-muted-foreground">Em dia</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="schedule" className="space-y-4">
        <TabsList>
          <TabsTrigger value="schedule">Planeamento</TabsTrigger>
          <TabsTrigger value="records">Registos</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Pesquisar matrícula..." 
                value={search} 
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {activeStatusFilter !== "all" && (
              <Button variant="outline" size="sm" onClick={() => setActiveStatusFilter("all")}>
                Limpar filtro
              </Button>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block w-3 h-3 rounded bg-destructive/20 border border-destructive/30" /> Expirado
              <span className="inline-block w-3 h-3 rounded bg-orange-100 border border-orange-200 ml-2" /> &lt;30d
              <span className="inline-block w-3 h-3 rounded bg-yellow-100 border border-yellow-200 ml-2" /> &lt;90d
              <span className="inline-block w-3 h-3 rounded bg-emerald-100 border border-emerald-200 ml-2" /> OK
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10 min-w-[100px]">Matrícula</TableHead>
                      {CATEGORIES.map(c => (
                        <TableHead key={c.key} className="text-center min-w-[90px] text-xs">
                          <div className="flex flex-col items-center gap-0.5">
                            <c.icon className="h-3.5 w-3.5" />
                            {c.short}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVehicles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={CATEGORIES.length + 1} className="text-center py-8 text-muted-foreground">
                          Sem dados de planeamento
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredVehicles.map(v => (
                        <TableRow key={v.id}>
                          <TableCell className="sticky left-0 bg-background z-10 font-mono font-medium text-sm">
                            {v.plate}
                          </TableCell>
                          {CATEGORIES.map(c => (
                            <ScheduleCell
                              key={c.key}
                              schedule={scheduleLookup[v.id]?.[c.key]}
                              vehicle={v}
                              category={c}
                              onEdit={handleEdit}
                            />
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="records" className="space-y-4">
          <div className="flex items-center justify-end gap-2">
            <ImportButton
              columns={["plate", "type", "description", "cost", "status", "date_scheduled"]}
              aliases={ALIASES}
              requiredColumns={["plate", "type"]}
              validate={(r) => ({ valid: !!r.plate && !!r.type, error: !r.plate ? "Matrícula em falta" : !r.type ? "Tipo em falta" : undefined })}
              onImport={handleImport}
              templateHeader="matrícula;tipo;descrição;custo;estado;data agendada"
              templateExample="12-AB-34;Preventiva;Troca de óleo;150;Pendente;2026-03-15"
              templateFilename="modelo_manutencao.csv"
            />
            <ExportButton data={exportData} filenameBase="manutencao" sheetName="Manutenção" />
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Custo</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sem registos de manutenção</TableCell></TableRow>
                  ) : (
                    records.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono">{(r.vehicles as any)?.plate || "—"}</TableCell>
                        <TableCell className="capitalize">{r.type === "preventive" ? "Preventiva" : "Corretiva"}</TableCell>
                        <TableCell>{r.description || "—"}</TableCell>
                        <TableCell>{r.cost ? `€${Number(r.cost).toFixed(2)}` : "—"}</TableCell>
                        <TableCell><Badge variant={statusMap[r.status]?.variant}>{statusMap[r.status]?.label}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Editar {CATEGORIES.find(c => c.key === editDialog?.category)?.label || ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{editDialog?.category === "Lavagem" ? "Última lavagem" : "Próxima data"}</Label>
              <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
            </div>
            {editDialog?.category === "Revisão KM" && (
              <div className="space-y-2">
                <Label>Próximo KM</Label>
                <Input type="number" value={editKm} onChange={e => setEditKm(e.target.value)} placeholder="Ex: 1500000" />
              </div>
            )}
            {editDialog?.category === "Revisão Horas" && (
              <div className="space-y-2">
                <Label>Próximas Horas</Label>
                <Input type="number" value={editHours} onChange={e => setEditHours(e.target.value)} placeholder="Ex: 18000" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "A guardar..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
