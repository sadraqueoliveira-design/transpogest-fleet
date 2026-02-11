import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  Truck, AlertTriangle, Fuel, Thermometer, CreditCard,
  RefreshCw, Bell, Navigation, Store, Warehouse,
  Search, LayoutGrid, Map as MapIcon, Filter, Send, Users, Check
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import VehicleCard from "@/components/admin/VehicleCard";
import VehicleDetailPanel from "@/components/admin/VehicleDetailPanel";
import ComplianceWidget from "@/components/admin/ComplianceWidget";
import ComplianceViolationsPanel from "@/components/admin/ComplianceViolationsPanel";

interface Vehicle {
  id: string;
  plate: string;
  last_lat: number | null;
  last_lng: number | null;
  last_speed: number | null;
  tachograph_status: string | null;
  current_driver_id: string | null;
  fuel_level_percent: number | null;
  odometer_km: number | null;
  engine_hours: number | null;
  rpm: number | null;
  temperature_data: any;
  brand: string | null;
  model: string | null;
  updated_at: string;
  tachograph_calibration_date: string | null;
  client_id: string | null;
  trackit_id: string | null;
  mobile_number: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

interface EmployeeCard {
  card_number: string;
  full_name: string;
}

interface TachoCard {
  card_number: string;
  driver_name: string | null;
}

interface HubLocation {
  id: string;
  name: string;
  code: string;
  lat: number | null;
  lng: number | null;
  type: string | null;
  client_id: string;
}

interface Notification {
  id: string;
  type: "maintenance" | "request";
  message: string;
  time: string;
}

type ViewMode = "cards" | "map";
type FilterTab = "all" | "moving" | "stopped" | "alerts" | "at_store" | "at_supplier";

export default function Dashboard() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [employeeCards, setEmployeeCards] = useState<EmployeeCard[]>([]);
  const [tachoCards, setTachoCards] = useState<TachoCard[]>([]);
  const [hubs, setHubs] = useState<HubLocation[]>([]);

  const [trailers, setTrailers] = useState<any[]>([]);

  const fetchVehicles = async () => {
    const [{ data: vData }, { data: cData }, { data: tData }, { data: eData }, { data: tcData }, { data: hData }] = await Promise.all([
      supabase.from("vehicles").select("*"),
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("trailers").select("id, plate, internal_id, status, last_linked_vehicle_id"),
      supabase.from("employees").select("card_number, full_name").not("card_number", "is", null),
      supabase.from("tachograph_cards").select("card_number, driver_name"),
      supabase.from("hubs").select("id, name, code, lat, lng, type, client_id").not("lat", "is", null),
    ]);
    if (vData) setVehicles(vData);
    if (cData) setClients(cData);
    if (tData) setTrailers(tData);
    if (eData) setEmployeeCards(eData as EmployeeCard[]);
    if (tcData) setTachoCards(tcData as TachoCard[]);
    if (hData) setHubs(hData as HubLocation[]);
  };

  useEffect(() => {
    fetchVehicles();

    const channel = supabase
      .channel("admin-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "maintenance_records" }, (payload) => {
        const rec = payload.new as any;
        setNotifications((prev) => [{
          id: rec.id, type: "maintenance",
          message: `Nova manutenção ${rec.type === "preventive" ? "preventiva" : "corretiva"} registada`,
          time: new Date().toLocaleTimeString("pt-PT"),
        }, ...prev.slice(0, 19)]);
        toast.info("Nova manutenção registada");
        fetchVehicles();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "service_requests" }, (payload) => {
        const req = payload.new as any;
        setNotifications((prev) => [{
          id: req.id, type: "request",
          message: `Nova solicitação: ${req.type}`,
          time: new Date().toLocaleTimeString("pt-PT"),
        }, ...prev.slice(0, 19)]);
        toast.info("Nova solicitação de motorista");
        fetchVehicles();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "maintenance_records" }, () => fetchVehicles())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_requests" }, () => fetchVehicles())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Computed stats
  const getStatus = (v: Vehicle) => (v.last_speed || 0) > 5 ? "moving" : "stopped";

  const hasAlert = (v: Vehicle) => {
    if (v.fuel_level_percent != null && v.fuel_level_percent < 15) return true;
    if (v.temperature_data) {
      const td = v.temperature_data as any;
      const t1 = td?.t1 ?? td?.T1;
      const t2 = td?.t2 ?? td?.T2;
      if ((typeof t1 === "number" && t1 > 8) || (typeof t2 === "number" && t2 > 8)) return true;
    }
    return false;
  };

  const now = new Date();
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  // Find nearest hub within 2km (moved before stats)
  const getNearestHub = (v: Vehicle): HubLocation | null => {
    if (v.last_lat == null || v.last_lng == null) return null;
    let best: HubLocation | null = null;
    let bestDist = 2; // max 2km
    for (const h of hubs) {
      if (h.lat == null || h.lng == null) continue;
      const dlat = (v.last_lat - h.lat) * 111.32;
      const dlng = (v.last_lng - h.lng!) * 111.32 * Math.cos(v.last_lat * Math.PI / 180);
      const dist = Math.sqrt(dlat * dlat + dlng * dlng);
      if (dist < bestDist) { bestDist = dist; best = h; }
    }
    return best;
  };

  const isAtStore = (v: Vehicle) => {
    const h = getNearestHub(v);
    if (!h || !h.type) return false;
    const t = h.type.toLowerCase();
    return ["loja", "supermercado", "hipermercado", "ultra proximidade", "franchising", "partenariado", "mfc"].includes(t);
  };

  const isAtSupplier = (v: Vehicle) => {
    const h = getNearestHub(v);
    if (!h || !h.type) return false;
    const t = h.type.toLowerCase();
    return ["fornecedor", "entreposto arp", "centro de distribuição"].includes(t);
  };

  const stats = {
    total: vehicles.length,
    moving: vehicles.filter(v => getStatus(v) === "moving").length,
    stopped: vehicles.filter(v => getStatus(v) === "stopped").length,
    alerts: vehicles.filter(v => hasAlert(v)).length,
    lowFuel: vehicles.filter(v => v.fuel_level_percent != null && v.fuel_level_percent < 15).length,
    highTemp: vehicles.filter(v => {
      if (!v.temperature_data) return false;
      const td = v.temperature_data as any;
      const t1 = td?.t1 ?? td?.T1;
      const t2 = td?.t2 ?? td?.T2;
      return (typeof t1 === "number" && t1 > 8) || (typeof t2 === "number" && t2 > 8);
    }).length,
    cardsExpiring: vehicles.filter(v =>
      v.tachograph_calibration_date &&
      new Date(v.tachograph_calibration_date) <= in60Days &&
      new Date(v.tachograph_calibration_date) > now
    ).length,
    cardsExpired: vehicles.filter(v =>
      v.tachograph_calibration_date &&
      new Date(v.tachograph_calibration_date) <= now
    ).length,
    atStore: vehicles.filter(v => isAtStore(v)).length,
    atSupplier: vehicles.filter(v => isAtSupplier(v)).length,
  };

  // Normalize card number: remove prefix "5B.", leading zeros, last 2 digits
  const normalizeCard = (cn: string) => cn.replace(/^5B\.?/i, "").replace(/^0+/, "").slice(0, -2);

  // Resolve driver name from dc1 card number
  const resolveDriverName = (dc1: string | null): string | null => {
    if (!dc1) return null;
    const norm = dc1.replace(/^0+/, "");
    // Try employees first
    for (const e of employeeCards) {
      const eNorm = normalizeCard(e.card_number);
      if (eNorm === norm || norm.includes(eNorm) || eNorm.includes(norm)) return e.full_name;
    }
    // Try tachograph_cards
    for (const tc of tachoCards) {
      const tcNorm = tc.card_number.replace(/^0+/, "");
      if (tcNorm === norm || norm.includes(tcNorm) || tcNorm.includes(norm)) return tc.driver_name;
    }
    return null;
  };

  // Extract dc1 from tachograph_status
  const getDc1 = (v: Vehicle): string | null => {
    if (!v.tachograph_status) return null;
    try { return JSON.parse(v.tachograph_status)?.dc1 || null; } catch { return null; }
  };


  const filtered = vehicles.filter(v => {
    if (clientFilter && clientFilter !== "all" && v.client_id !== clientFilter) return false;
    if (search) {
      const q = search.toLowerCase().trim();
      const plate = v.plate.toLowerCase().includes(q);
      const trackitMatch = v.trackit_id?.toLowerCase().includes(q) || v.mobile_number?.toLowerCase().includes(q);
      const cName = clients.find(c => c.id === v.client_id)?.name?.toLowerCase().includes(q);
      const driverName = resolveDriverName(getDc1(v))?.toLowerCase().includes(q);
      const nearHub = getNearestHub(v);
      const hubMatch = nearHub && (nearHub.name.toLowerCase().includes(q) || nearHub.code.toLowerCase().includes(q));
      if (!plate && !trackitMatch && !cName && !driverName && !hubMatch) return false;
    }
    if (filterTab === "moving") return getStatus(v) === "moving";
    if (filterTab === "stopped") return getStatus(v) === "stopped";
    if (filterTab === "alerts") return hasAlert(v);
    if (filterTab === "at_store") return isAtStore(v);
    if (filterTab === "at_supplier") return isAtSupplier(v);
    return true;
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-trackit-data");
      if (error) throw error;
      const results = data?.results || [];
      const totalCount = results.reduce((sum: number, r: any) => sum + (r.count || 0), 0);
      toast.success(`${totalCount} veículos sincronizados`);
      fetchVehicles();
    } catch (err: any) {
      toast.error("Erro ao sincronizar: " + (err.message || "Erro desconhecido"));
    }
    setSyncing(false);
  };

  const [sendingPush, setSendingPush] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [pushTitle, setPushTitle] = useState("TranspoGest");
  const [pushBody, setPushBody] = useState("");
  const [pushTarget, setPushTarget] = useState<"all" | "selected">("all");
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  const [driverProfiles, setDriverProfiles] = useState<{ id: string; full_name: string | null }[]>([]);

  useEffect(() => {
    if (!pushDialogOpen) return;
    const fetchDrivers = async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "driver");
      if (!data) return;
      const ids = data.map(d => d.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      setDriverProfiles(profiles || []);
    };
    fetchDrivers();
  }, [pushDialogOpen]);

  const toggleDriver = (id: string) => {
    setSelectedDriverIds(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const handleSendPush = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) {
      toast.error("Preencha o título e a mensagem");
      return;
    }
    if (pushTarget === "selected" && selectedDriverIds.length === 0) {
      toast.error("Selecione pelo menos um motorista");
      return;
    }
    setSendingPush(true);
    try {
      const body: any = { title: pushTitle.trim(), body: pushBody.trim() };
      if (pushTarget === "selected") body.user_ids = selectedDriverIds;
      const { data, error } = await supabase.functions.invoke("send-push", { body });
      if (error) throw error;
      toast.success(`Push enviado: ${data.sent} entregue(s), ${data.failed || 0} falha(s)`);
      setPushDialogOpen(false);
      setPushBody("");
      setSelectedDriverIds([]);
      setPushTarget("all");
    } catch (err: any) {
      toast.error("Erro ao enviar push: " + (err.message || "Erro desconhecido"));
    }
    setSendingPush(false);
  };

  // Map with clustering
  useEffect(() => {
    if (viewMode !== "map" || !mapRef.current) return;
    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }

    const initMap = async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      // @ts-ignore
      await import("leaflet.markercluster");
      await import("leaflet.markercluster/dist/MarkerCluster.css");
      await import("leaflet.markercluster/dist/MarkerCluster.Default.css");

      const map = L.map(mapRef.current!, { zoomControl: true }).setView([39.5, -8.0], 7);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      mapInstance.current = map;

      // @ts-ignore
      const clusterGroup = L.markerClusterGroup({
        iconCreateFunction: (cluster: any) => {
          const count = cluster.getChildCount();
          return L.divIcon({
            html: `<div style="width:48px;height:48px;background:hsl(152 60% 42%);border-radius:50%;border:3px solid white;box-shadow:0 2px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;">${count}</div>`,
            className: "", iconSize: [48, 48], iconAnchor: [24, 24],
          });
        },
        maxClusterRadius: 60,
      });

      filtered.forEach((v) => {
        if (v.last_lat && v.last_lng) {
          const speed = v.last_speed || 0;
          const alert = hasAlert(v);
          const color = alert ? "#ef4444" : speed > 5 ? "#22c55e" : "#9ca3af";
          const icon = L.divIcon({
            html: `<div style="width:28px;height:28px;background:${color};border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M18 17H6V4h2v6l2-1.5L12 10V4h6v13z"/></svg>
            </div>`,
            className: "", iconSize: [28, 28], iconAnchor: [14, 14],
          });
          const clientName = clients.find(c => c.id === v.client_id)?.name;
          const driverName = resolveDriverName(getDc1(v));
          const nearHub = getNearestHub(v);
          const marker = L.marker([v.last_lat, v.last_lng], { icon })
            .bindPopup(`<div style="font-family:Inter,sans-serif;min-width:160px">
              <strong>${v.plate}</strong>${(v.mobile_number || v.trackit_id) ? ` <span style="color:#999;font-size:10px">#${v.mobile_number || v.trackit_id}</span>` : ''}
              ${driverName ? `<br/><span style="font-size:12px">👤 ${driverName}</span>` : ''}
              ${clientName ? `<br/><span style="color:#888;font-size:11px">${clientName}</span>` : ''}
              ${nearHub ? `<br/><span style="font-size:11px">🏪 Loja ${nearHub.code} — ${nearHub.name}</span>` : ''}<br/>
              <span style="color:#666">${speed} km/h · ${v.fuel_level_percent ?? "—"}% fuel</span>
            </div>`);
          clusterGroup.addLayer(marker);
        }
      });
      map.addLayer(clusterGroup);

      const withCoords = filtered.filter((v) => v.last_lat && v.last_lng);
      if (withCoords.length > 0) {
        map.fitBounds(L.latLngBounds(withCoords.map((v) => [v.last_lat!, v.last_lng!])), { padding: [50, 50] });
      }
    };
    initMap();
    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [viewMode, filtered.length, filterTab]);

  const widgetCards: { label: string; value: number; icon: any; variant: string; action: () => void }[] = [
    { label: "Total", value: stats.total, icon: Truck, variant: "default", action: () => setFilterTab("all") },
    { label: "Em Movimento", value: stats.moving, icon: Navigation, variant: "success", action: () => setFilterTab("moving") },
    { label: "Parados", value: stats.stopped, icon: Truck, variant: "default", action: () => setFilterTab("stopped") },
    { label: "Alertas", value: stats.alerts, icon: AlertTriangle, variant: "destructive", action: () => setFilterTab("alerts") },
    { label: "Comb. Baixo", value: stats.lowFuel, icon: Fuel, variant: "warning", action: () => setFilterTab("alerts") },
    { label: "Temp. Alta", value: stats.highTemp, icon: Thermometer, variant: "destructive", action: () => setFilterTab("alerts") },
    { label: "Cart. a Vencer", value: stats.cardsExpiring, icon: CreditCard, variant: "default", action: () => setFilterTab("all") },
    { label: "Cart. Vencidos", value: stats.cardsExpired, icon: CreditCard, variant: "default", action: () => setFilterTab("all") },
    { label: "Em Loja", value: stats.atStore, icon: Store, variant: "success", action: () => setFilterTab("at_store") },
    { label: "Em Fornecedor", value: stats.atSupplier, icon: Warehouse, variant: "default", action: () => setFilterTab("at_supplier") },
  ];

  const variantStyles: Record<string, string> = {
    default: "", success: "text-success",
    destructive: "border-destructive/40 text-destructive",
    warning: "border-warning/40 text-warning",
  };
  const variantBorder: Record<string, string> = {
    default: "", success: "", destructive: "border-destructive/30", warning: "border-warning/30",
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "moving", label: "Mov." },
    { key: "stopped", label: "Parados" },
    { key: "alerts", label: "Alertas" },
    { key: "at_store", label: "Em Loja" },
    { key: "at_supplier", label: "Fornecedor" },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-header">Painel de Controlo</h1>
          <p className="page-subtitle">Gestão Global do Sistema</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={pushDialogOpen} onOpenChange={setPushDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Send className="mr-2 h-4 w-4" />
                Enviar Push
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Enviar Notificação Push</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="push-title">Título</Label>
                  <Input id="push-title" value={pushTitle} onChange={e => setPushTitle(e.target.value)} placeholder="TranspoGest" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="push-body">Mensagem</Label>
                  <Textarea id="push-body" value={pushBody} onChange={e => setPushBody(e.target.value)} placeholder="Escreva a mensagem..." rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Destinatários</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant={pushTarget === "all" ? "default" : "outline"} size="sm" onClick={() => { setPushTarget("all"); setSelectedDriverIds([]); }}>
                      <Users className="mr-1.5 h-3.5 w-3.5" /> Todos
                    </Button>
                    <Button type="button" variant={pushTarget === "selected" ? "default" : "outline"} size="sm" onClick={() => setPushTarget("selected")}>
                      <Check className="mr-1.5 h-3.5 w-3.5" /> Selecionar
                    </Button>
                  </div>
                </div>
                {pushTarget === "selected" && (
                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border p-2">
                    {driverProfiles.length === 0 && <p className="text-sm text-muted-foreground py-2 text-center">Nenhum motorista encontrado</p>}
                    {driverProfiles.map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDriver(d.id)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${selectedDriverIds.includes(d.id) ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
                      >
                        <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selectedDriverIds.includes(d.id) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                          {selectedDriverIds.includes(d.id) && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        {d.full_name || "Sem nome"}
                      </button>
                    ))}
                  </div>
                )}
                <Button onClick={handleSendPush} disabled={sendingPush || !pushTitle.trim() || !pushBody.trim() || (pushTarget === "selected" && selectedDriverIds.length === 0)} className="w-full">
                  <Send className={`mr-2 h-4 w-4 ${sendingPush ? "animate-pulse" : ""}`} />
                  {sendingPush ? "A enviar..." : pushTarget === "all" ? "Enviar para todos" : `Enviar para ${selectedDriverIds.length} motorista(s)`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "A sincronizar..." : "Sincronizar GPS"}
          </Button>
        </div>
      </div>

      {/* Compact Status Widgets */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
        {widgetCards.map((card) => (
          <button
            key={card.label}
            onClick={card.action}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${variantBorder[card.variant]}`}
          >
            <card.icon className={`h-4 w-4 shrink-0 ${variantStyles[card.variant] || "text-muted-foreground"}`} />
            <div className="min-w-0">
              <p className={`text-lg font-bold leading-none ${variantStyles[card.variant]}`}>{card.value}</p>
              <p className="text-[10px] text-muted-foreground truncate">{card.label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Compliance Violations Panel */}
      <ComplianceViolationsPanel />

      {/* Search + view toggle + filter tabs */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Pesquisar matrícula, motorista, nº móvel, cliente, loja..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={clientFilter || "all"} onValueChange={v => setClientFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-48">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={viewMode === "cards" ? "default" : "outline"} size="icon" onClick={() => setViewMode("cards")}>
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === "map" ? "default" : "outline"} size="icon" onClick={() => setViewMode("map")}>
            <MapIcon className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="flex items-center gap-4 text-sm border-b pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              className={`flex items-center gap-1.5 pb-1 font-medium transition-colors ${
                filterTab === tab.key ? "text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className={`text-xs font-bold ${tab.key === "alerts" && stats.alerts > 0 ? "bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5" : ""}`}>
                {stats[tab.key === "all" ? "total" : tab.key === "moving" ? "moving" : tab.key === "stopped" ? "stopped" : "alerts"]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Map or Vehicle Cards */}
      {viewMode === "map" ? (
        <Card>
          <CardContent className="p-0 relative">
            <div ref={mapRef} className="h-[400px] lg:h-[550px] rounded-lg" />
            <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur rounded-lg p-3 shadow-md z-[1000] text-xs space-y-1.5">
              <p className="font-semibold text-sm">Legenda</p>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-success" />Em Movimento</div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-muted-foreground" />Parado</div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-destructive" />Alerta</div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-muted" />Ignição OFF</div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {filtered.length === 0 ? (
            <Card className="col-span-full py-12 text-center text-muted-foreground">Nenhum veículo encontrado</Card>
          ) : (
            [...filtered].sort((a, b) => {
              const aMoving = (a.last_speed || 0) > 5 ? 1 : 0;
              const bMoving = (b.last_speed || 0) > 5 ? 1 : 0;
              return bMoving - aMoving;
            }).map((v) => {
              const speed = v.last_speed || 0;
              const isMoving = speed > 5;
              const alert = hasAlert(v);
              const td = v.temperature_data as any;
              const t1 = td?.t1 ?? td?.T1 ?? td?.tp1;
              const t2 = td?.t2 ?? td?.T2 ?? td?.tp2;

              // Parse tachograph_status JSON for extra data
              let tacho: any = {};
              if (v.tachograph_status) {
                try { tacho = JSON.parse(v.tachograph_status); } catch {}
              }

              // Use DB columns first, fallback to tachograph JSON
              const fuel = v.fuel_level_percent ?? tacho.flv ?? null;
              const adblue = tacho.adbl ?? null;
              const engineH = v.engine_hours ?? tacho.ehr ?? null;
              const odo = v.odometer_km ?? tacho.ckm ?? null;
              const rpm = v.rpm ?? tacho.rpm ?? null;
              const driverCard = tacho.dc1 || null;
              const driverName = resolveDriverName(driverCard);
              const cName = clients.find(c => c.id === v.client_id)?.name;
              const linkedTrailer = trailers.find(t => t.last_linked_vehicle_id === v.id && t.status === "coupled");
              const nearestHub = getNearestHub(v);
              const locationName = nearestHub?.name || (v as any).last_location_name;
              const hasCoords = v.last_lat != null && v.last_lng != null;

              return (
                <div
                  key={v.id}
                  onClick={() => setSelectedVehicle(v)}
                  className={`rounded-lg border p-3 cursor-pointer transition-all hover:shadow-md ${
                    isMoving
                      ? "bg-success/10 border-success/50 hover:border-success/70"
                      : alert
                        ? "border-destructive/50 bg-destructive/5 hover:border-destructive/70"
                        : "bg-card border-border hover:border-primary/30"
                  }`}
                >
                  {/* Header: status dot + plate + trackit_id + speed */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${isMoving ? "bg-success animate-pulse" : alert ? "bg-destructive" : "bg-muted-foreground"}`} />
                      <span className="font-bold text-sm tracking-wide">{v.plate}</span>
                      {(v.mobile_number || v.trackit_id) && <span className="text-[10px] text-muted-foreground font-mono">#{v.mobile_number || v.trackit_id}</span>}
                    </div>
                    <span className={`text-[11px] font-bold tabular-nums ${isMoving ? "text-success" : "text-muted-foreground"}`}>{speed} km/h</span>
                  </div>

                  {/* Driver name */}
                  {driverName && (
                    <p className="text-[11px] font-medium text-foreground truncate mb-0.5">
                      👤 {driverName}
                    </p>
                  )}

                  {/* Brand/Client */}
                  <p className="text-[10px] text-muted-foreground truncate mb-1">
                    {v.brand && v.model ? `${v.brand} ${v.model}` : ""}
                    {cName ? `${v.brand ? " · " : ""}${cName}` : ""}
                  </p>

                  {/* Coupled trailer */}
                  {linkedTrailer && (
                    <p className="text-[10px] font-medium text-primary truncate mb-2">
                      🔗 {linkedTrailer.plate} {linkedTrailer.internal_id ? `(${linkedTrailer.internal_id})` : ""}
                    </p>
                  )}

                  {/* Data rows */}
                  <div className="space-y-0.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">⛽ Comb.</span>
                      <span className={`font-semibold tabular-nums ${fuel != null && fuel < 15 ? "text-destructive" : fuel != null ? "text-foreground" : "text-muted-foreground"}`}>
                        {fuel != null ? `${Math.round(fuel)}%` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">💧 AdBlue</span>
                      <span className={`font-semibold tabular-nums ${adblue != null && adblue < 10 ? "text-warning" : adblue != null ? "text-foreground" : "text-muted-foreground"}`}>
                        {adblue != null ? `${Math.round(adblue)}%` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">🔧 H.Motor</span>
                      <span className="font-semibold tabular-nums">{engineH != null ? Math.round(engineH).toLocaleString("pt-PT") : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">📏 Km</span>
                      <span className="font-semibold tabular-nums">{odo != null ? Math.round(odo).toLocaleString("pt-PT") : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">⚙️ RPM</span>
                      <span className="font-semibold tabular-nums">{rpm ?? "—"}</span>
                    </div>
                    {(typeof t1 === "number" || typeof t2 === "number") && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">🌡️ Temp</span>
                        <span className={`font-semibold tabular-nums ${(typeof t1 === "number" && t1 > 8) || (typeof t2 === "number" && t2 > 8) ? "text-destructive" : ""}`}>
                          {typeof t1 === "number" ? `${t1.toFixed(1)}°` : ""}
                          {typeof t1 === "number" && typeof t2 === "number" ? " / " : ""}
                          {typeof t2 === "number" ? `${t2.toFixed(1)}°` : ""}
                        </span>
                      </div>
                    )}
                    {(locationName || hasCoords) && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{nearestHub ? "🏪" : "📍"} {nearestHub ? `Loja ${nearestHub.code}` : "Local"}</span>
                        <span className="font-semibold text-[10px] truncate max-w-[120px] text-right" title={locationName || `${v.last_lat!.toFixed(4)}, ${v.last_lng!.toFixed(4)}`}>
                          {locationName || `${v.last_lat!.toFixed(4)}, ${v.last_lng!.toFixed(4)}`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Driver card - show name if no driverName already shown */}
                  {driverCard && !driverName && (
                    <div className="mt-2 pt-1.5 border-t text-[10px] text-muted-foreground truncate">
                      🪪 {driverCard}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground">{filtered.length} de {vehicles.length} veículo(s)</p>

      {/* Notifications */}
      {notifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              Notificações em Tempo Real
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {notifications.map((n) => (
              <div key={n.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <Badge variant={n.type === "maintenance" ? "default" : "secondary"}>
                    {n.type === "maintenance" ? "Manutenção" : "Solicitação"}
                  </Badge>
                  <span className="text-sm">{n.message}</span>
                </div>
                <span className="text-xs text-muted-foreground">{n.time}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ComplianceWidget />

      <VehicleDetailPanel
        vehicle={selectedVehicle}
        open={!!selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
      />
    </div>
  );
}
