import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, LayoutGrid, Map as MapIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  temperature_data: any;
  brand: string | null;
  model: string | null;
  updated_at: string;
}

type ViewMode = "cards" | "map";
type FilterTab = "all" | "moving" | "stopped" | "alerts";

export default function LiveMap() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [syncing, setSyncing] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  const fetchVehicles = async () => {
    const { data } = await supabase.from("vehicles").select("*");
    if (data) setVehicles(data);
  };

  useEffect(() => { fetchVehicles(); }, []);

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
            className: "",
            iconSize: [48, 48],
            iconAnchor: [24, 24],
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
            className: "",
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });

          const marker = L.marker([v.last_lat, v.last_lng], { icon })
            .bindPopup(`
              <div style="font-family:Inter,sans-serif;min-width:160px">
                <strong style="font-size:14px">${v.plate}</strong><br/>
                <span style="color:#666">Velocidade: ${speed} km/h</span><br/>
                <span style="color:#666">Combustível: ${v.fuel_level_percent ?? "N/A"}%</span><br/>
                <span style="color:#666">Tacógrafo: ${v.tachograph_status || "N/A"}</span>
              </div>
            `);
          clusterGroup.addLayer(marker);
        }
      });

      map.addLayer(clusterGroup);

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
  }, [viewMode, filtered.length, filterTab]);

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

      {/* Search + view toggles */}
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
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-muted" />Ignição OFF</div>
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
              <VehicleCard key={v.id} vehicle={v} hasAlert={hasAlert(v)} />
            ))
          )}
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground">
        {filtered.length} de {vehicles.length} veículo(s)
      </p>
    </div>
  );
}
