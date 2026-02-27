import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, LayoutGrid, Map as MapIcon, RefreshCw, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import VehicleCard from "@/components/admin/VehicleCard";
import VehicleDetailPanel from "@/components/admin/VehicleDetailPanel";

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
  client_id: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

interface HubLocation {
  id: string;
  name: string;
  code: string;
  lat: number | null;
  lng: number | null;
  type: string | null;
}

type ViewMode = "cards" | "map";
type FilterTab = "all" | "moving" | "stopped" | "alerts";

export default function LiveMap() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [hubs, setHubs] = useState<HubLocation[]>([]);
  const [proximityRadius, setProximityRadius] = useState(2);
  const [showHubCircles, setShowHubCircles] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  const fetchVehicles = async () => {
    const [{ data: vData }, { data: cData }, { data: hData }, { data: configData }] = await Promise.all([
      supabase.from("vehicles").select("*"),
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("hubs").select("id, name, code, lat, lng, type").not("lat", "is", null),
      supabase.from("app_config").select("value").eq("key", "proximity_radius_km").maybeSingle(),
    ]);
    if (vData) setVehicles(vData);
    if (cData) setClients(cData);
    if (hData) setHubs(hData as HubLocation[]);
    if (configData?.value) setProximityRadius(parseFloat(configData.value));
  };

  useEffect(() => { fetchVehicles(); }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) { setCountdown(30); return; }
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchVehicles();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const getStatus = (v: Vehicle) => {
    if ((v.last_speed || 0) > 5) return "moving";
    return "stopped";
  };

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

  const filtered = vehicles.filter(v => {
    if (clientFilter && clientFilter !== "all" && v.client_id !== clientFilter) return false;
    const matchSearch = !search || v.plate.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filterTab === "moving") return getStatus(v) === "moving";
    if (filterTab === "stopped") return getStatus(v) === "stopped";
    if (filterTab === "alerts") return hasAlert(v);
    return true;
  });

  const counts = {
    all: vehicles.length,
    moving: vehicles.filter(v => getStatus(v) === "moving").length,
    stopped: vehicles.filter(v => getStatus(v) === "stopped").length,
    alerts: vehicles.filter(v => hasAlert(v)).length,
  };

  // Map initialization with clustering
  useEffect(() => {
    if (viewMode !== "map" || !mapRef.current) return;

    // Cleanup previous
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const initMap = async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      // Import markercluster and manually attach to L if needed
      const mc = await import("leaflet.markercluster");
      await import("leaflet.markercluster/dist/MarkerCluster.css");
      await import("leaflet.markercluster/dist/MarkerCluster.Default.css");

      const map = L.map(mapRef.current!, { zoomControl: true }).setView([39.5, -8.0], 7);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      mapInstance.current = map;

      // markerClusterGroup may be on L or on the mc import
      const createClusterGroup = (L as any).markerClusterGroup || (mc as any).markerClusterGroup || (mc as any).default?.markerClusterGroup;
      
      // Fallback: after importing the side-effect module, it should be on L
      const clusterGroup = typeof createClusterGroup === 'function' 
        ? createClusterGroup({
            iconCreateFunction: (cluster: any) => {
              const count = cluster.getChildCount();
              return L.divIcon({
                html: `<div style="width:48px;height:48px;background:hsl(152 60% 42%);border-radius:50%;border:3px solid white;box-shadow:0 2px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;">${count}</div>`,
                className: "",
                iconSize: [48, 48],
                iconAnchor: [24, 24],
              });
            },
            maxClusterRadius: 60,
          })
        : (L as any).MarkerClusterGroup 
          ? new (L as any).MarkerClusterGroup({
              iconCreateFunction: (cluster: any) => {
                const count = cluster.getChildCount();
                return L.divIcon({
                  html: `<div style="width:48px;height:48px;background:hsl(152 60% 42%);border-radius:50%;border:3px solid white;box-shadow:0 2px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;">${count}</div>`,
                  className: "",
                  iconSize: [48, 48],
                  iconAnchor: [24, 24],
                });
              },
              maxClusterRadius: 60,
            })
          : L.layerGroup(); // Ultimate fallback: no clustering

      filtered.forEach((v) => {
        if (v.last_lat && v.last_lng) {
          const speed = v.last_speed || 0;
          const alert = hasAlert(v);
          const color = alert ? "#ef4444" : speed > 5 ? "#22c55e" : "#9ca3af";
          const icon = L.divIcon({
            html: `<div style="width:28px;height:28px;background:${color};border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M18 17H6V4h2v6l2-1.5L12 10V4h6v13z"/></svg>
            </div>`,
            className: "",
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });

          const clientName = clients.find(c => c.id === v.client_id)?.name;
          const marker = L.marker([v.last_lat, v.last_lng], { icon })
            .bindPopup(`
              <div style="font-family:Inter,sans-serif;min-width:160px">
                <strong style="font-size:14px">${v.plate}</strong>${clientName ? `<br/><span style="color:#888;font-size:11px">${clientName}</span>` : ''}<br/>
                <span style="color:#666">Velocidade: ${speed} km/h</span><br/>
                <span style="color:#666">Combustível: ${v.fuel_level_percent ?? "N/A"}%</span><br/>
                <span style="color:#666">Tacógrafo: ${v.tachograph_status || "N/A"}</span>
              </div>
            `);
          clusterGroup.addLayer(marker);
        }
      });

      map.addLayer(clusterGroup);

      // Draw proximity radius circles around hubs
      if (showHubCircles) {
      hubs.forEach((h) => {
        if (h.lat != null && h.lng != null) {
          const isStore = h.type === 'store' || h.type === 'hub';
          L.circle([h.lat, h.lng], {
            radius: proximityRadius * 1000,
            color: isStore ? 'hsl(152, 60%, 42%)' : 'hsl(220, 60%, 50%)',
            fillColor: isStore ? 'hsl(152, 60%, 42%)' : 'hsl(220, 60%, 50%)',
            fillOpacity: 0.08,
            weight: 1.5,
            dashArray: '6 4',
          }).addTo(map);

          const hubIcon = L.divIcon({
            html: `<div style="width:22px;height:22px;background:${isStore ? 'hsl(152,60%,42%)' : 'hsl(220,60%,50%)'};border-radius:4px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
              <span style="font-size:11px">${isStore ? '🏪' : '🏭'}</span>
            </div>`,
            className: "", iconSize: [22, 22], iconAnchor: [11, 11],
          });
          L.marker([h.lat, h.lng], { icon: hubIcon })
            .bindPopup(`<div style="font-family:Inter,sans-serif"><strong>${h.code}</strong><br/>${h.name}<br/><span style="color:#888;font-size:11px">Raio: ${proximityRadius} km</span></div>`)
            .addTo(map);
        }
      });
      }

      const withCoords = filtered.filter((v) => v.last_lat && v.last_lng);
      if (withCoords.length > 0) {
        const bounds = L.latLngBounds(withCoords.map((v) => [v.last_lat!, v.last_lng!]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    };

    initMap();

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [viewMode, filtered.length, filterTab, proximityRadius, showHubCircles]);

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
      toast.error("Erro: " + (err.message || "Desconhecido"));
    }
    setSyncing(false);
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "moving", label: "Mov." },
    { key: "stopped", label: "Parados" },
    { key: "alerts", label: "Alertas" },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="page-header">Mapa ao Vivo</h1>
        <p className="page-subtitle">Localização em tempo real da frota</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar matrícula, motorista..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
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
        <Button
          variant={viewMode === "cards" ? "default" : "outline"}
          size="icon"
          onClick={() => setViewMode("cards")}
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
        <Button
          variant={viewMode === "map" ? "default" : "outline"}
          size="icon"
          onClick={() => setViewMode("map")}
        >
          <MapIcon className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
        </Button>
        <Button
          variant={autoRefresh ? "default" : "outline"}
          size="sm"
          onClick={() => setAutoRefresh(!autoRefresh)}
          className="text-xs gap-1.5 min-w-[80px]"
        >
          {autoRefresh ? `Auto ${countdown}s` : "Auto OFF"}
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-4 text-sm border-b pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterTab(tab.key)}
            className={`flex items-center gap-1.5 pb-1 font-medium transition-colors ${
              filterTab === tab.key
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            <span className={`text-xs font-bold ${
              tab.key === "alerts" && counts.alerts > 0 ? "bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5" : ""
            }`}>
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {viewMode === "map" ? (
        <Card>
          <CardContent className="p-0 relative">
            <div ref={mapRef} className="h-[500px] lg:h-[600px] rounded-lg" />
            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur rounded-lg p-3 shadow-md z-[1000] text-xs space-y-1.5">
              <p className="font-semibold text-sm">Legenda</p>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-success" />Em Movimento</div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-muted-foreground" />Parado</div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-destructive" />Alerta</div>
              <button onClick={() => setShowHubCircles(!showHubCircles)} className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                <div className={`h-3 w-3 rounded-sm border ${showHubCircles ? '' : 'opacity-40'}`} style={{ background: showHubCircles ? 'hsl(152, 60%, 42%)' : 'transparent', borderColor: 'hsl(152, 60%, 42%)' }} />
                <span className={showHubCircles ? '' : 'line-through opacity-60'}>Hub/Loja + Raio {proximityRadius} km</span>
              </button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="py-12 text-center text-muted-foreground">
              Nenhum veículo encontrado
            </Card>
          ) : (
            filtered.map((v) => (
              <VehicleCard key={v.id} vehicle={v} hasAlert={hasAlert(v)} clientName={clients.find(c => c.id === v.client_id)?.name} onClick={() => setSelectedVehicle(v)} />
            ))
          )}
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground">
        {filtered.length} de {vehicles.length} veículo(s)
      </p>

      <VehicleDetailPanel
        vehicle={selectedVehicle}
        open={!!selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
      />
    </div>
  );
}
