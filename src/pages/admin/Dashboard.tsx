import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Truck, AlertTriangle, Fuel, Thermometer, CreditCard,
  RefreshCw, Bell, Navigation, Store, Warehouse,
  Search, LayoutGrid, Map as MapIcon
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import VehicleCard from "@/components/admin/VehicleCard";

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
}

interface Notification {
  id: string;
  type: "maintenance" | "request";
  message: string;
  time: string;
}

type ViewMode = "cards" | "map";
type FilterTab = "all" | "moving" | "stopped" | "alerts";

export default function Dashboard() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  const fetchVehicles = async () => {
    const { data } = await supabase.from("vehicles").select("*");
    if (data) setVehicles(data);
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
  };

  const filtered = vehicles.filter(v => {
    const matchSearch = !search || v.plate.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filterTab === "moving") return getStatus(v) === "moving";
    if (filterTab === "stopped") return getStatus(v) === "stopped";
    if (filterTab === "alerts") return hasAlert(v);
    return true;
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-trackit-data");
      if (error) throw error;
      if (data?.success) {
        toast.success(`${data.updated} veículos atualizados`);
        fetchVehicles();
      } else {
        toast.error(data?.error || "Erro na sincronização");
      }
    } catch (err: any) {
      toast.error("Erro ao sincronizar: " + (err.message || "Erro desconhecido"));
    }
    setSyncing(false);
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
          const marker = L.marker([v.last_lat, v.last_lng], { icon })
            .bindPopup(`<div style="font-family:Inter,sans-serif;min-width:160px">
              <strong>${v.plate}</strong><br/>
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

  const widgetCards = [
    { label: "Total", value: stats.total, icon: Truck, variant: "default" as const },
    { label: "Em Movimento", value: stats.moving, icon: Navigation, variant: "success" as const },
    { label: "Parados", value: stats.stopped, icon: Truck, variant: "default" as const },
    { label: "Alertas", value: stats.alerts, icon: AlertTriangle, variant: "destructive" as const },
    { label: "Comb. Baixo", value: stats.lowFuel, icon: Fuel, variant: "warning" as const },
    { label: "Temp. Alta", value: stats.highTemp, icon: Thermometer, variant: "destructive" as const },
    { label: "Cart. a Vencer", value: stats.cardsExpiring, icon: CreditCard, variant: "default" as const },
    { label: "Cart. Vencidos", value: stats.cardsExpired, icon: CreditCard, variant: "default" as const },
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
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-header">Painel de Controlo</h1>
          <p className="page-subtitle">Gestão Global do Sistema</p>
        </div>
        <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm">
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "A sincronizar..." : "Sincronizar GPS"}
        </Button>
      </div>

      {/* Status Widget Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {widgetCards.map((card) => (
          <Card key={card.label} className={`text-center py-4 px-3 ${variantBorder[card.variant]}`}>
            <CardContent className="p-0 flex flex-col items-center gap-1">
              <card.icon className={`h-6 w-6 ${variantStyles[card.variant] || "text-muted-foreground"}`} />
              <span className={`text-3xl font-bold ${variantStyles[card.variant]}`}>{card.value}</span>
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Location summary row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="py-3 px-2">
          <CardContent className="p-0 flex items-center gap-2 justify-center">
            <Store className="h-5 w-5 text-primary" />
            <div><span className="text-lg font-bold">0</span><p className="text-xs text-muted-foreground">Em Lojas</p></div>
          </CardContent>
        </Card>
        <Card className="py-3 px-2">
          <CardContent className="p-0 flex items-center gap-2 justify-center">
            <Warehouse className="h-5 w-5 text-warning" />
            <div><span className="text-lg font-bold">0</span><p className="text-xs text-muted-foreground">Armazém/CD</p></div>
          </CardContent>
        </Card>
        <Card className="py-3 px-2">
          <CardContent className="p-0 flex items-center gap-2 justify-center">
            <Navigation className="h-5 w-5 text-success" />
            <div><span className="text-lg font-bold">{stats.moving}</span><p className="text-xs text-muted-foreground">Em Trânsito</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Search + view toggle + filter tabs */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Pesquisar matrícula, motorista..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
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
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="py-12 text-center text-muted-foreground">Nenhum veículo encontrado</Card>
          ) : (
            filtered.map((v) => <VehicleCard key={v.id} vehicle={v} hasAlert={hasAlert(v)} />)
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
    </div>
  );
}
