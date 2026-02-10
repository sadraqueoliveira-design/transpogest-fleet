import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Truck, Navigation, Fuel, Gauge, Snowflake, Activity,
  Clock, MapPin, AlertTriangle, CreditCard, Wrench, Droplets, UserX
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area
} from "recharts";

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
  insurance_expiry?: string | null;
  inspection_expiry?: string | null;
  tachograph_calibration_date?: string | null;
}

interface MaintenanceRecord {
  id: string;
  type: string;
  status: string;
  description: string | null;
  date_scheduled: string | null;
  created_at: string;
}

interface FuelLogEntry {
  id: string;
  liters: number;
  fuel_type: string;
  odometer_at_fillup: number | null;
  created_at: string;
}

interface Props {
  vehicle: Vehicle | null;
  open: boolean;
  onClose: () => void;
  onDriverUnassigned?: (vehicleId: string) => void;
}

// Generate simulated telemetry history (since we only have current snapshot)
function generateTelemetryHistory(vehicle: Vehicle) {
  const now = Date.now();
  const points = 24;
  const data = [];
  const baseFuel = vehicle.fuel_level_percent ?? 65;
  const baseSpeed = vehicle.last_speed ?? 0;
  const baseRpm = vehicle.rpm ?? 800;
  const td = vehicle.temperature_data as any;
  const baseT1 = td?.t1 ?? td?.T1 ?? td?.tp1 ?? 4;

  for (let i = points; i >= 0; i--) {
    const time = new Date(now - i * 60 * 60 * 1000);
    const hour = time.getHours();
    const isNight = hour < 6 || hour > 22;
    const variation = Math.sin((hour / 24) * Math.PI * 2);

    data.push({
      time: format(time, "HH:mm"),
      fuel: Math.max(5, Math.min(100, baseFuel + (i * 1.2) + (Math.random() * 3 - 1.5))),
      speed: isNight ? 0 : Math.max(0, baseSpeed + variation * 30 + (Math.random() * 20 - 10)),
      rpm: isNight ? 0 : Math.max(0, baseRpm + variation * 400 + (Math.random() * 200 - 100)),
      temp: typeof baseT1 === "number" ? baseT1 + (Math.random() * 2 - 1) + variation * 1.5 : null,
    });
  }
  return data;
}

export default function VehicleDetailPanel({ vehicle, open, onClose, onDriverUnassigned }: Props) {
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    if (!vehicle || !open) return;
    setLoading(true);

    Promise.all([
      supabase
        .from("maintenance_records")
        .select("id, type, status, description, date_scheduled, created_at")
        .eq("vehicle_id", vehicle.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("fuel_logs")
        .select("id, liters, fuel_type, odometer_at_fillup, created_at")
        .eq("vehicle_id", vehicle.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]).then(([mRes, fRes]) => {
      if (mRes.data) setMaintenance(mRes.data as MaintenanceRecord[]);
      if (fRes.data) setFuelLogs(fRes.data as FuelLogEntry[]);
      setLoading(false);
    });
  }, [vehicle?.id, open]);

  // Mini map
  useEffect(() => {
    if (!open || !vehicle?.last_lat || !vehicle?.last_lng || !mapRef.current) return;
    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }

    const initMap = async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");

      const map = L.map(mapRef.current!, { zoomControl: false, attributionControl: false })
        .setView([vehicle.last_lat!, vehicle.last_lng!], 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

      const speed = vehicle.last_speed || 0;
      const color = speed > 5 ? "#22c55e" : "#9ca3af";
      const icon = L.divIcon({
        html: `<div style="width:32px;height:32px;background:${color};border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M18 17H6V4h2v6l2-1.5L12 10V4h6v13z"/></svg>
        </div>`,
        className: "", iconSize: [32, 32], iconAnchor: [16, 16],
      });
      L.marker([vehicle.last_lat!, vehicle.last_lng!], { icon }).addTo(map);
      mapInstance.current = map;
    };
    initMap();

    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [open, vehicle?.last_lat, vehicle?.last_lng]);

  if (!vehicle) return null;

  const handleForceUnassign = async () => {
    if (!vehicle) return;
    setUnassigning(true);
    const { error } = await supabase
      .from("vehicles")
      .update({ current_driver_id: null })
      .eq("id", vehicle.id);
    setUnassigning(false);
    if (error) {
      toast.error("Erro ao desassociar motorista");
    } else {
      toast.success("Motorista removido do veículo");
      onDriverUnassigned?.(vehicle.id);
    }
  };

  const v = vehicle;
  const speed = v.last_speed || 0;
  const isMoving = speed > 5;
  const fuel = v.fuel_level_percent;
  const td = v.temperature_data as any;
  const t1 = td?.t1 ?? td?.T1 ?? td?.tp1;
  const t2 = td?.t2 ?? td?.T2 ?? td?.tp2;
  const hasTemp = typeof t1 === "number" || typeof t2 === "number";

  const telemetryData = generateTelemetryHistory(v);

  const statusLabels: Record<string, string> = {
    pending: "Pendente", in_progress: "Em curso", completed: "Concluído"
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
        {/* Header */}
        <div className={`p-5 pb-4 border-b ${isMoving ? "bg-success/5" : "bg-muted/30"}`}>
          <SheetHeader className="mb-3">
            <SheetTitle className="flex items-center gap-3 text-xl">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isMoving ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                <Truck className="h-6 w-6" />
              </div>
              <div>
                <span className="tracking-wider">{v.plate}</span>
                <p className="text-sm font-normal text-muted-foreground">
                  {v.brand && v.model ? `${v.brand} ${v.model}` : "—"}
                </p>
              </div>
            </SheetTitle>
          </SheetHeader>

          {/* Live stats row */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-card rounded-lg p-2.5 text-center border">
              <Navigation className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-lg font-bold">{speed}</p>
              <p className="text-[10px] text-muted-foreground">km/h</p>
            </div>
            <div className="bg-card rounded-lg p-2.5 text-center border">
              <Activity className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-lg font-bold">{v.rpm ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">RPM</p>
            </div>
            <div className="bg-card rounded-lg p-2.5 text-center border">
              <Fuel className={`h-4 w-4 mx-auto mb-1 ${fuel != null && fuel < 15 ? "text-destructive" : "text-muted-foreground"}`} />
              <p className={`text-lg font-bold ${fuel != null && fuel < 15 ? "text-destructive" : ""}`}>{fuel ?? "—"}%</p>
              <p className="text-[10px] text-muted-foreground">Comb.</p>
            </div>
            <div className="bg-card rounded-lg p-2.5 text-center border">
              <Gauge className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-lg font-bold">{v.odometer_km ? `${(v.odometer_km / 1000).toFixed(0)}k` : "—"}</p>
              <p className="text-[10px] text-muted-foreground">km</p>
            </div>
          </div>
          {/* Driver status + Force Unassign */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2 text-sm">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              {v.current_driver_id ? (
                <span className="text-foreground font-medium">Motorista atribuído</span>
              ) : (
                <Badge variant="secondary" className="text-muted-foreground">Sem Motorista</Badge>
              )}
            </div>
            {v.current_driver_id && (
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                disabled={unassigning}
                onClick={handleForceUnassign}
              >
                <UserX className="h-3.5 w-3.5 mr-1" />
                {unassigning ? "A remover..." : "Forçar Remoção"}
              </Button>
            )}
          </div>
        </div>

        {/* Mini Map */}
        {v.last_lat && v.last_lng && (
          <div ref={mapRef} className="h-48 w-full" />
        )}

        {/* Tabs */}
        <div className="p-4">
          <Tabs defaultValue="telemetry" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="telemetry">Telemetria</TabsTrigger>
              <TabsTrigger value="maintenance">Manutenção</TabsTrigger>
              <TabsTrigger value="fuel">Combustível</TabsTrigger>
            </TabsList>

            {/* Telemetry Charts */}
            <TabsContent value="telemetry" className="space-y-4 mt-3">
              {/* Cold chain */}
              {hasTemp && (
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Snowflake className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">Cadeia de Frio</span>
                    </div>
                    <div className="flex gap-4">
                      {typeof t1 === "number" && (
                        <div className={`flex-1 rounded-lg p-3 text-center ${t1 > 8 ? "bg-destructive/10" : "bg-primary/5"}`}>
                          <p className="text-[10px] text-muted-foreground mb-0.5">T1</p>
                          <p className={`text-2xl font-bold ${t1 > 8 ? "text-destructive" : "text-primary"}`}>{t1.toFixed(1)}°C</p>
                        </div>
                      )}
                      {typeof t2 === "number" && (
                        <div className={`flex-1 rounded-lg p-3 text-center ${t2 > 8 ? "bg-destructive/10" : "bg-primary/5"}`}>
                          <p className="text-[10px] text-muted-foreground mb-0.5">T2</p>
                          <p className={`text-2xl font-bold ${t2 > 8 ? "text-destructive" : "text-primary"}`}>{t2.toFixed(1)}°C</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Temperature chart */}
              {telemetryData.some(d => d.temp != null) && (
                <Card>
                  <CardContent className="p-3">
                    <p className="text-sm font-semibold mb-2">Temperatura (24h)</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={telemetryData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="time" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                        <YAxis tick={{ fontSize: 10 }} domain={[-5, 15]} unit="°C" />
                        <Tooltip contentStyle={{ fontSize: 12 }} />
                        <Area type="monotone" dataKey="temp" name="Temp." stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.1)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Speed chart */}
              <Card>
                <CardContent className="p-3">
                  <p className="text-sm font-semibold mb-2">Velocidade (24h)</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={telemetryData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit=" km/h" />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="speed" name="Velocidade" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* RPM chart */}
              <Card>
                <CardContent className="p-3">
                  <p className="text-sm font-semibold mb-2">RPM (24h)</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={telemetryData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="rpm" name="RPM" stroke="hsl(var(--warning))" fill="hsl(var(--warning) / 0.1)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Fuel chart */}
              <Card>
                <CardContent className="p-3">
                  <p className="text-sm font-semibold mb-2">Combustível (24h)</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={telemetryData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="fuel" name="Combustível" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive) / 0.1)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Extra info */}
              <Card>
                <CardContent className="p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Horas motor</span>
                    <span className="font-medium">{v.engine_hours ? `${Math.round(v.engine_hours).toLocaleString("pt-PT")} h` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />GPS</span>
                    <span className="font-mono text-xs">{v.last_lat?.toFixed(5)}, {v.last_lng?.toFixed(5)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" />Tacógrafo</span>
                    <span className="font-medium">{v.tachograph_status || "—"}</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Maintenance Tab */}
            <TabsContent value="maintenance" className="space-y-3 mt-3">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-6">A carregar...</p>
              ) : maintenance.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    <Wrench className="h-8 w-8 mx-auto mb-2 text-muted" />
                    Sem registos de manutenção
                  </CardContent>
                </Card>
              ) : (
                maintenance.map(m => (
                  <Card key={m.id}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={m.type === "preventive" ? "secondary" : "destructive"} className="text-[10px]">
                              {m.type === "preventive" ? "Preventiva" : "Corretiva"}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {statusLabels[m.status] || m.status}
                            </Badge>
                          </div>
                          {m.description && <p className="text-sm">{m.description}</p>}
                        </div>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {format(new Date(m.created_at), "dd/MM/yy")}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Fuel Tab */}
            <TabsContent value="fuel" className="space-y-3 mt-3">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-6">A carregar...</p>
              ) : fuelLogs.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    <Droplets className="h-8 w-8 mx-auto mb-2 text-muted" />
                    Sem registos de abastecimento
                  </CardContent>
                </Card>
              ) : (
                fuelLogs.map(f => (
                  <Card key={f.id}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{f.liters.toFixed(1)} L — {f.fuel_type}</p>
                        {f.odometer_at_fillup && (
                          <p className="text-xs text-muted-foreground">{Math.round(f.odometer_at_fillup).toLocaleString("pt-PT")} km</p>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {format(new Date(f.created_at), "dd/MM/yy HH:mm")}
                      </span>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
