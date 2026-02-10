import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Fuel, Plus, Search, Droplets, Gauge, TrendingDown, FileText, Snowflake, Thermometer, Bell, CheckCheck, ArrowUpCircle, RefreshCw } from "lucide-react";
import { ExportButton, exportCSV } from "@/components/admin/BulkImportExport";

interface FuelLog {
  id: string;
  created_at: string;
  fuel_type: string;
  liters: number;
  price_per_liter: number | null;
  odometer_at_fillup: number | null;
  reefer_engine_hours: number | null;
  receipt_photo_url: string | null;
  vehicle_id: string;
  driver_id: string;
}

interface Vehicle {
  id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  fuel_level_percent: number | null;
  odometer_km: number | null;
  engine_hours: number | null;
  tachograph_status: string | null;
  temperature_data: any;
  client_id: string | null;
}

interface Profile {
  id: string;
  full_name: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

interface FuelAlert {
  id: string;
  vehicle_id: string;
  alert_type: string;
  level_percent: number | null;
  threshold_percent: number;
  acknowledged: boolean;
  created_at: string;
}

interface RefuelingEvent {
  id: string;
  vehicle_id: string;
  detected_at: string;
  fuel_before: number | null;
  fuel_after: number | null;
  estimated_liters: number | null;
  source: string;
  acknowledged: boolean;
}

const alertTypeLabels: Record<string, string> = {
  low_fuel: "⛽ Combustível Baixo",
  low_adblue: "💧 AdBlue Baixo",
  low_reefer_fuel: "❄️ Comb. Motor Frio Baixo",
};

const fuelTypeLabels: Record<string, string> = {
  Diesel: "Diesel",
  AdBlue: "AdBlue",
  Reefer_Diesel: "Thermo King",
};

export default function FuelManagement() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("telemetry");
  const [alerts, setAlerts] = useState<FuelAlert[]>([]);
  const [refuelingEvents, setRefuelingEvents] = useState<RefuelingEvent[]>([]);
  const [form, setForm] = useState({
    vehicle_id: "",
    fuel_type: "Diesel",
    liters: "",
    price_per_liter: "",
    odometer_at_fillup: "",
    reefer_engine_hours: "",
  });
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-trackit-data`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na sincronização");
      const total = data.results?.reduce((s: number, r: any) => s + (r.count || 0), 0) || 0;
      toast.success(`Sincronização concluída — ${total} veículos atualizados`);
      fetchData();
      fetchAlerts();
      fetchRefuelingEvents();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Falha na sincronização"));
    } finally {
      setSyncing(false);
    }
  };

  const fetchAlerts = async () => {
    const { data } = await supabase
      .from("fuel_alerts")
      .select("*")
      .eq("acknowledged", false)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setAlerts(data as FuelAlert[]);
  };

  const acknowledgeAlert = async (id: string) => {
    await supabase.from("fuel_alerts").update({
      acknowledged: true,
      acknowledged_by: user?.id,
      acknowledged_at: new Date().toISOString(),
    } as any).eq("id", id);
    setAlerts(prev => prev.filter(a => a.id !== id));
    toast.success("Alerta reconhecido");
  };

  const acknowledgeAll = async () => {
    if (alerts.length === 0) return;
    const ids = alerts.map(a => a.id);
    await supabase.from("fuel_alerts").update({
      acknowledged: true,
      acknowledged_by: user?.id,
      acknowledged_at: new Date().toISOString(),
    } as any).in("id", ids);
    setAlerts([]);
    toast.success("Todos os alertas reconhecidos");
  };

  const fetchRefuelingEvents = async () => {
    const { data } = await supabase
      .from("refueling_events")
      .select("*")
      .order("detected_at", { ascending: false })
      .limit(100);
    if (data) setRefuelingEvents(data as RefuelingEvent[]);
  };

  const fetchData = async () => {
    const [{ data: logsData }, { data: vData }, { data: pData }, { data: cData }] = await Promise.all([
      supabase.from("fuel_logs").select("*").order("created_at", { ascending: false }),
      supabase.from("vehicles").select("*").order("plate"),
      supabase.from("profiles").select("id, full_name"),
      supabase.from("clients").select("id, name").order("name"),
    ]);
    if (logsData) setLogs(logsData);
    if (vData) setVehicles(vData);
    if (pData) setProfiles(pData);
    if (cData) setClients(cData);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    fetchAlerts();
    fetchRefuelingEvents();
    const channel = supabase
      .channel("fuel-alerts-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "fuel_alerts" }, () => {
        fetchAlerts();
        toast.warning("⚠️ Novo alerta de combustível!");
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "refueling_events" }, () => {
        fetchRefuelingEvents();
        toast.success("⛽ Abastecimento detetado automaticamente!");
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const getVehicle = (id: string) => vehicles.find(v => v.id === id);
  const getProfile = (id: string) => profiles.find(p => p.id === id);
  const getClient = (id: string) => clients.find(c => c.id === id);

  // Automatic fuel data from telemetry
  const telemetryVehicles = vehicles
    .filter(v => {
      if (clientFilter && clientFilter !== "all" && v.client_id !== clientFilter) return false;
      if (search && !v.plate.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .map(v => {
      let tacho: any = {};
      if (v.tachograph_status) {
        try { tacho = JSON.parse(v.tachograph_status); } catch {}
      }
      const td = v.temperature_data as any;
      const fuel = v.fuel_level_percent ?? tacho.flv ?? null;
      const adblue = tacho.adbl ?? null;
      const tfl = tacho.tfl ?? null;
      const frt = tacho.frt ?? null; // reefer/fridge running status (1=on, 0=off)
      const t1 = td?.tp1 ?? td?.t1 ?? td?.T1 ?? null;
      const t2 = td?.tp2 ?? td?.t2 ?? td?.T2 ?? null;
      const t3 = td?.tp3 ?? td?.t3 ?? td?.T3 ?? null;
      const hasReefer = frt != null || (td && Object.keys(td).length > 0);
      return { ...v, fuel, adblue, tfl, frt, t1, t2, t3, hasReefer };
    })
    .sort((a, b) => (a.fuel ?? 999) - (b.fuel ?? 999));

  // Filtered manual logs
  const filteredLogs = logs.filter(l => {
    const v = getVehicle(l.vehicle_id);
    if (clientFilter && clientFilter !== "all" && v?.client_id !== clientFilter) return false;
    if (search && v && !v.plate.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Stats
  const totalLiters = logs.reduce((sum, l) => sum + l.liters, 0);
  const totalCost = logs.reduce((sum, l) => sum + (l.liters * (l.price_per_liter || 0)), 0);
  const lowFuelCount = telemetryVehicles.filter(v => v.fuel != null && v.fuel < 15).length;
  const lowAdblueCount = telemetryVehicles.filter(v => v.adblue != null && v.adblue < 10).length;
  const reeferActiveCount = telemetryVehicles.filter(v => v.frt === 1).length;
  const reeferVehicles = telemetryVehicles.filter(v => v.hasReefer);

  // AdBlue sorted view — show all vehicles, those with data first sorted by level
  const adblueVehicles = [...telemetryVehicles]
    .sort((a, b) => {
      if (a.adblue != null && b.adblue != null) return a.adblue - b.adblue;
      if (a.adblue != null) return -1;
      if (b.adblue != null) return 1;
      return 0;
    });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicle_id || !form.liters) return;
    const { error } = await supabase.from("fuel_logs").insert({
      vehicle_id: form.vehicle_id,
      driver_id: user?.id,
      fuel_type: form.fuel_type as any,
      liters: parseFloat(form.liters),
      price_per_liter: form.price_per_liter ? parseFloat(form.price_per_liter) : null,
      odometer_at_fillup: form.odometer_at_fillup ? parseFloat(form.odometer_at_fillup) : null,
      reefer_engine_hours: form.fuel_type === "Reefer_Diesel" && form.reefer_engine_hours ? parseFloat(form.reefer_engine_hours) : null,
    });
    if (error) { toast.error("Erro: " + error.message); }
    else {
      toast.success("Abastecimento registado");
      setDialogOpen(false);
      setForm({ vehicle_id: "", fuel_type: "Diesel", liters: "", price_per_liter: "", odometer_at_fillup: "", reefer_engine_hours: "" });
      fetchData();
    }
  };

  const fuelColor = (pct: number | null) => {
    if (pct == null) return "text-muted-foreground";
    if (pct < 15) return "text-destructive font-bold";
    if (pct < 30) return "text-warning font-semibold";
    return "text-foreground";
  };

  // Export data
  const telemetryExportData = telemetryVehicles.map(v => ({
    Matrícula: v.plate,
    "Marca/Modelo": [v.brand, v.model].filter(Boolean).join(" ") || "",
    Cliente: v.client_id ? getClient(v.client_id)?.name || "" : "",
    "Combustível (%)": v.fuel != null ? Math.round(v.fuel) : "",
    "AdBlue (%)": v.adblue != null ? Math.round(v.adblue) : "",
    "Consumo Total (L)": v.tfl != null ? Math.round(v.tfl) : "",
    Km: v.odometer_km != null ? Math.round(v.odometer_km) : "",
    "H. Motor": v.engine_hours != null ? Math.round(v.engine_hours) : "",
  }));

  const adblueExportData = adblueVehicles.map(v => ({
    Matrícula: v.plate,
    "Marca/Modelo": [v.brand, v.model].filter(Boolean).join(" ") || "",
    Cliente: v.client_id ? getClient(v.client_id)?.name || "" : "",
    "AdBlue (%)": v.adblue != null ? Math.round(v.adblue) : "",
    Km: v.odometer_km != null ? Math.round(v.odometer_km) : "",
    "H. Motor": v.engine_hours != null ? Math.round(v.engine_hours) : "",
  }));

  const reeferExportData = reeferVehicles.map(v => ({
    Matrícula: v.plate,
    "Marca/Modelo": [v.brand, v.model].filter(Boolean).join(" ") || "",
    Cliente: v.client_id ? getClient(v.client_id)?.name || "" : "",
    "Motor Frio": v.frt === 1 ? "Ligado" : v.frt === 0 ? "Desligado" : "—",
    "T1 (°C)": typeof v.t1 === "number" ? v.t1.toFixed(1) : "",
    "T2 (°C)": typeof v.t2 === "number" ? v.t2.toFixed(1) : "",
    "T3 (°C)": typeof v.t3 === "number" ? v.t3.toFixed(1) : "",
  }));

  const manualExportData = filteredLogs.map(l => {
    const v = getVehicle(l.vehicle_id);
    const p = getProfile(l.driver_id);
    const total = l.liters * (l.price_per_liter || 0);
    return {
      Data: format(new Date(l.created_at), "dd/MM/yyyy HH:mm", { locale: pt }),
      Matrícula: v?.plate || "",
      Motorista: p?.full_name || "",
      Tipo: fuelTypeLabels[l.fuel_type] || l.fuel_type,
      Litros: l.liters,
      "Preço/L (€)": l.price_per_liter || "",
      "Total (€)": total > 0 ? total.toFixed(2) : "",
      Km: l.odometer_at_fillup || "",
    };
  });

  const exportPDF = (title: string, data: Record<string, any>[]) => {
    if (data.length === 0) { toast.error("Sem dados para exportar"); return; }
    const headers = Object.keys(data[0]);
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Popup bloqueado"); return; }
    printWindow.document.write(`
      <html><head><title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; font-size: 11px; }
        h1 { font-size: 16px; margin-bottom: 4px; }
        p { color: #666; font-size: 10px; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 4px 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
        tr:nth-child(even) { background: #fafafa; }
        @media print { body { margin: 10px; } }
      </style></head><body>
      <h1>${title}</h1>
      <p>Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: pt })} · ${data.length} registos</p>
      <table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${data.map(r => `<tr>${headers.map(h => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></body></html>
    `);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-header">Gestão de Abastecimento</h1>
          <p className="page-subtitle">Monitorização automática e registos manuais</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sync button */}
          <Button variant="outline" size="icon" onClick={handleSync} disabled={syncing} title="Sincronizar Trackit">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          </Button>

          {/* Alerts bell */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="relative">
                <Bell className="h-4 w-4" />
                {alerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {alerts.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="end">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h4 className="font-semibold text-sm">Alertas Ativos</h4>
                {alerts.length > 0 && (
                  <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" onClick={acknowledgeAll}>
                    <CheckCheck className="h-3 w-3" /> Reconhecer Todos
                  </Button>
                )}
              </div>
              <ScrollArea className="max-h-80">
                {alerts.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Sem alertas ativos</p>
                ) : (
                  <div className="divide-y">
                    {alerts.map(a => {
                      const v = getVehicle(a.vehicle_id);
                      return (
                        <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{alertTypeLabels[a.alert_type] || a.alert_type}</p>
                            <p className="text-xs text-muted-foreground">
                              {v?.plate || "—"} · {a.level_percent != null ? `${Math.round(a.level_percent)}%` : "—"} (limiar: {a.threshold_percent}%)
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(a.created_at), "dd/MM HH:mm", { locale: pt })}
                            </p>
                          </div>
                          <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => acknowledgeAlert(a.id)}>
                            OK
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Registar Abastecimento</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registar Abastecimento Manual</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Veículo *</Label>
                <Select value={form.vehicle_id} onValueChange={v => setForm({ ...form, vehicle_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar veículo" /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.plate} {v.brand ? `- ${v.brand} ${v.model || ""}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={form.fuel_type} onValueChange={v => setForm({ ...form, fuel_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Diesel">Diesel</SelectItem>
                    <SelectItem value="AdBlue">AdBlue</SelectItem>
                    <SelectItem value="Reefer_Diesel">Thermo King (Reefer)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Litros *</Label>
                  <Input type="number" step="0.01" value={form.liters} onChange={e => setForm({ ...form, liters: e.target.value })} required placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label>Preço/L (€)</Label>
                  <Input type="number" step="0.001" value={form.price_per_liter} onChange={e => setForm({ ...form, price_per_liter: e.target.value })} placeholder="0.000" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Quilometragem</Label>
                <Input type="number" value={form.odometer_at_fillup} onChange={e => setForm({ ...form, odometer_at_fillup: e.target.value })} placeholder="km" />
              </div>
              {form.fuel_type === "Reefer_Diesel" && (
                <div className="space-y-2">
                  <Label>Horímetro (Horas Motor)</Label>
                  <Input type="number" step="0.1" value={form.reefer_engine_hours} onChange={e => setForm({ ...form, reefer_engine_hours: e.target.value })} placeholder="Horas" />
                </div>
              )}
              <Button type="submit" className="w-full">Registar</Button>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
          <Fuel className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-lg font-bold">{totalLiters.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} L</p>
            <p className="text-[11px] text-muted-foreground">Total Abastecido</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
          <TrendingDown className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-lg font-bold">{totalCost.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}</p>
            <p className="text-[11px] text-muted-foreground">Custo Total</p>
          </div>
        </div>
        <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${lowFuelCount > 0 ? "border-destructive/40" : ""}`}>
          <Gauge className={`h-5 w-5 ${lowFuelCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          <div>
            <p className={`text-lg font-bold ${lowFuelCount > 0 ? "text-destructive" : ""}`}>{lowFuelCount}</p>
            <p className="text-[11px] text-muted-foreground">Comb. Baixo (&lt;15%)</p>
          </div>
        </div>
        <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${lowAdblueCount > 0 ? "border-warning/40" : ""}`}>
          <Droplets className={`h-5 w-5 ${lowAdblueCount > 0 ? "text-warning" : "text-muted-foreground"}`} />
          <div>
            <p className={`text-lg font-bold ${lowAdblueCount > 0 ? "text-warning" : ""}`}>{lowAdblueCount}</p>
            <p className="text-[11px] text-muted-foreground">AdBlue Baixo (&lt;10%)</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
          <Snowflake className={`h-5 w-5 ${reeferActiveCount > 0 ? "text-primary" : "text-muted-foreground"}`} />
          <div>
            <p className={`text-lg font-bold ${reeferActiveCount > 0 ? "text-primary" : ""}`}>{reeferActiveCount}/{reeferVehicles.length}</p>
            <p className="text-[11px] text-muted-foreground">Motor Frio Ligado</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Pesquisar matrícula..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={clientFilter || "all"} onValueChange={v => setClientFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="telemetry" onValueChange={setActiveTab}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="telemetry">⛽ Combustível</TabsTrigger>
            <TabsTrigger value="adblue">💧 AdBlue ({adblueVehicles.length})</TabsTrigger>
            <TabsTrigger value="reefer">❄️ Motor Frio ({reeferVehicles.length})</TabsTrigger>
            <TabsTrigger value="manual">📝 Manual ({filteredLogs.length})</TabsTrigger>
            <TabsTrigger value="detected">🔄 Detetados ({refuelingEvents.length})</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <ExportButton
              data={activeTab === "telemetry" ? telemetryExportData : activeTab === "adblue" ? adblueExportData : activeTab === "reefer" ? reeferExportData : manualExportData}
              filenameBase={activeTab === "telemetry" ? "combustivel" : activeTab === "adblue" ? "adblue" : activeTab === "reefer" ? "motor_frio" : "abastecimentos_manuais"}
              sheetName="Abastecimento"
            />
            <Button variant="outline" size="sm" className="gap-2" onClick={() => {
              const map: Record<string, { data: any[]; title: string }> = {
                telemetry: { data: telemetryExportData, title: "Relatório de Combustível" },
                adblue: { data: adblueExportData, title: "Relatório de AdBlue" },
                reefer: { data: reeferExportData, title: "Relatório Motor de Frio" },
                manual: { data: manualExportData, title: "Registos de Abastecimento Manual" },
              };
              const { data, title } = map[activeTab] || map.telemetry;
              exportPDF(title, data);
            }}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        </div>

        {/* Automatic / Telemetry tab */}
        <TabsContent value="telemetry">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Marca/Modelo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">⛽ Combustível</TableHead>
                    <TableHead className="text-right">💧 AdBlue</TableHead>
                    <TableHead className="text-right">Consumo Total (L)</TableHead>
                    <TableHead className="text-right">Km</TableHead>
                    <TableHead className="text-right">H. Motor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {telemetryVehicles.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum veículo encontrado</TableCell></TableRow>
                  ) : (
                    telemetryVehicles.map(v => (
                      <TableRow key={v.id}>
                        <TableCell className="font-mono font-semibold">{v.plate}</TableCell>
                        <TableCell className="text-sm">{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{v.client_id ? getClient(v.client_id)?.name || "—" : "—"}</TableCell>
                        <TableCell className="text-right">
                          <span className={fuelColor(v.fuel)}>
                            {v.fuel != null ? `${Math.round(v.fuel)}%` : "—"}
                          </span>
                          {v.fuel != null && v.fuel < 15 && (
                            <Badge variant="destructive" className="ml-2 text-[9px] h-4">Baixo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={v.adblue != null && v.adblue < 10 ? "text-warning font-semibold" : ""}>
                            {v.adblue != null ? `${Math.round(v.adblue)}%` : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{v.tfl != null ? Math.round(v.tfl).toLocaleString("pt-PT") : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.odometer_km != null ? Math.round(v.odometer_km).toLocaleString("pt-PT") : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.engine_hours != null ? Math.round(v.engine_hours).toLocaleString("pt-PT") : "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AdBlue tab */}
        <TabsContent value="adblue">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Marca/Modelo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">💧 AdBlue (%)</TableHead>
                    <TableHead className="text-right">Km</TableHead>
                    <TableHead className="text-right">H. Motor</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adblueVehicles.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum veículo com dados de AdBlue</TableCell></TableRow>
                  ) : (
                    adblueVehicles.map(v => (
                      <TableRow key={v.id}>
                        <TableCell className="font-mono font-semibold">{v.plate}</TableCell>
                        <TableCell className="text-sm">{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{v.client_id ? getClient(v.client_id)?.name || "—" : "—"}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-semibold tabular-nums ${v.adblue != null && v.adblue < 10 ? "text-destructive" : v.adblue != null && v.adblue < 20 ? "text-warning" : ""}`}>
                            {v.adblue != null ? `${Math.round(v.adblue)}%` : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{v.odometer_km != null ? Math.round(v.odometer_km).toLocaleString("pt-PT") : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.engine_hours != null ? Math.round(v.engine_hours).toLocaleString("pt-PT") : "—"}</TableCell>
                        <TableCell>
                          {v.adblue != null && v.adblue < 10 ? (
                            <Badge variant="destructive">Crítico</Badge>
                          ) : v.adblue != null && v.adblue < 20 ? (
                            <Badge className="bg-warning text-warning-foreground">Baixo</Badge>
                          ) : (
                            <Badge variant="secondary">Normal</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reefer / Motor de Frio tab */}
        <TabsContent value="reefer">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Marca/Modelo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-center">Motor Frio</TableHead>
                    <TableHead className="text-right">T1 (°C)</TableHead>
                    <TableHead className="text-right">T2 (°C)</TableHead>
                    <TableHead className="text-right">T3 (°C)</TableHead>
                    <TableHead className="text-right">⛽ Comb.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reeferVehicles.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum veículo com motor de frio</TableCell></TableRow>
                  ) : (
                    reeferVehicles.map(v => (
                      <TableRow key={v.id}>
                        <TableCell className="font-mono font-semibold">{v.plate}</TableCell>
                        <TableCell className="text-sm">{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{v.client_id ? getClient(v.client_id)?.name || "—" : "—"}</TableCell>
                        <TableCell className="text-center">
                          {v.frt === 1 ? (
                            <Badge className="bg-success text-white">Ligado</Badge>
                          ) : v.frt === 0 ? (
                            <Badge variant="secondary">Desligado</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${typeof v.t1 === "number" && v.t1 > 8 ? "text-destructive" : typeof v.t1 === "number" && v.t1 > 5 ? "text-warning" : ""}`}>
                          {typeof v.t1 === "number" ? `${v.t1.toFixed(1)}°` : "—"}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${typeof v.t2 === "number" && v.t2 > 8 ? "text-destructive" : typeof v.t2 === "number" && v.t2 > 5 ? "text-warning" : ""}`}>
                          {typeof v.t2 === "number" ? `${v.t2.toFixed(1)}°` : "—"}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${typeof v.t3 === "number" && v.t3 > 8 ? "text-destructive" : typeof v.t3 === "number" && v.t3 > 5 ? "text-warning" : ""}`}>
                          {typeof v.t3 === "number" ? `${v.t3.toFixed(1)}°` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={fuelColor(v.fuel)}>
                            {v.fuel != null ? `${Math.round(v.fuel)}%` : "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manual logs tab */}
        <TabsContent value="manual">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Motorista</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Litros</TableHead>
                    <TableHead className="text-right">Preço/L</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Km</TableHead>
                    <TableHead>Recibo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum registo de abastecimento</TableCell></TableRow>
                  ) : (
                    filteredLogs.map(l => {
                      const v = getVehicle(l.vehicle_id);
                      const p = getProfile(l.driver_id);
                      const total = l.liters * (l.price_per_liter || 0);
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="text-sm">{format(new Date(l.created_at), "dd/MM/yy HH:mm", { locale: pt })}</TableCell>
                          <TableCell className="font-mono font-semibold">{v?.plate || "—"}</TableCell>
                          <TableCell className="text-sm">{p?.full_name || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{fuelTypeLabels[l.fuel_type] || l.fuel_type}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{l.liters.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}</TableCell>
                          <TableCell className="text-right tabular-nums">{l.price_per_liter ? `${l.price_per_liter.toFixed(3)} €` : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{total > 0 ? `${total.toFixed(2)} €` : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{l.odometer_at_fillup ? `${l.odometer_at_fillup.toLocaleString("pt-PT")}` : "—"}</TableCell>
                          <TableCell>
                            {l.receipt_photo_url ? (
                              <a href={l.receipt_photo_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">Ver</a>
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Detected refueling events tab */}
        <TabsContent value="detected">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Antes (%)</TableHead>
                    <TableHead className="text-center">→</TableHead>
                    <TableHead className="text-right">Depois (%)</TableHead>
                    <TableHead className="text-right">Subida</TableHead>
                    <TableHead>Fonte</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {refuelingEvents.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum abastecimento detetado automaticamente</TableCell></TableRow>
                  ) : (
                    refuelingEvents.map(ev => {
                      const v = getVehicle(ev.vehicle_id);
                      const increase = (ev.fuel_after ?? 0) - (ev.fuel_before ?? 0);
                      return (
                        <TableRow key={ev.id}>
                          <TableCell className="text-sm">{format(new Date(ev.detected_at), "dd/MM/yy HH:mm", { locale: pt })}</TableCell>
                          <TableCell className="font-mono font-semibold">{v?.plate || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{v?.client_id ? getClient(v.client_id)?.name || "—" : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{ev.fuel_before != null ? `${Math.round(ev.fuel_before)}%` : "—"}</TableCell>
                          <TableCell className="text-center"><ArrowUpCircle className="h-4 w-4 text-green-500 inline" /></TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{ev.fuel_after != null ? `${Math.round(ev.fuel_after)}%` : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-green-600">+{Math.round(increase)}%</TableCell>
                          <TableCell><Badge variant="secondary">{ev.source === "trackit" ? "Trackit" : ev.source}</Badge></TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-center text-muted-foreground">{telemetryVehicles.length} veículo(s) monitorizados</p>
    </div>
  );
}
