import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, MapPin, Trash2, Navigation, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ExportButton, ImportButton } from "@/components/admin/BulkImportExport";

interface RouteRow {
  id: string;
  start_location: string | null;
  end_location: string | null;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  driver_id: string | null;
  vehicle_id: string | null;
  waypoints: any;
  created_at: string;
}

interface DriverOption {
  user_id: string;
  full_name: string | null;
}

interface VehicleOption {
  id: string;
  plate: string;
}

const statusLabels: Record<string, string> = {
  planned: "Planeada",
  in_progress: "Em curso",
  completed: "Concluída",
  cancelled: "Cancelada",
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  planned: "secondary",
  in_progress: "default",
  completed: "outline",
  cancelled: "destructive",
};

const ROUTE_ALIASES: Record<string, string[]> = {
  start_location: ["start_location", "origem", "origin", "partida", "de"],
  end_location: ["end_location", "destino", "destination", "chegada", "para"],
  driver: ["driver", "motorista", "condutor", "driver_name"],
  vehicle: ["vehicle", "veículo", "veiculo", "matrícula", "matricula", "plate"],
};

export default function Routes() {
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    start_location: "",
    end_location: "",
    driver_id: "",
    vehicle_id: "",
  });
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);

  // View dialog
  const [viewOpen, setViewOpen] = useState(false);
  const [viewRoute, setViewRoute] = useState<RouteRow | null>(null);

  // Map refs
  const createMapRef = useRef<HTMLDivElement>(null);
  const createMapInstance = useRef<any>(null);
  const createMarkersRef = useRef<any[]>([]);
  const createPolylineRef = useRef<any>(null);

  const viewMapRef = useRef<HTMLDivElement>(null);
  const viewMapInstance = useRef<any>(null);

  const fetchAll = async () => {
    const [routeRes, driverRes, vehicleRes] = await Promise.all([
      supabase.from("routes").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id").eq("role", "driver"),
      supabase.from("vehicles").select("id, plate").order("plate"),
    ]);

    if (routeRes.data) setRoutes(routeRes.data as RouteRow[]);
    if (vehicleRes.data) setVehicles(vehicleRes.data);

    // Fetch driver names
    if (driverRes.data && driverRes.data.length > 0) {
      const ids = driverRes.data.map((d) => d.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      if (profiles) {
        setDrivers(profiles.map((p) => ({ user_id: p.id, full_name: p.full_name })));
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // Initialize create map
  useEffect(() => {
    if (!createOpen || !createMapRef.current) return;

    let map: any = null;
    const init = async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");

      if (createMapInstance.current) {
        createMapInstance.current.remove();
        createMapInstance.current = null;
      }

      map = L.map(createMapRef.current!, { zoomControl: true }).setView([39.5, -8.0], 7);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      createMapInstance.current = map;
      createMarkersRef.current = [];
      createPolylineRef.current = null;

      // Click to add waypoints
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng;
        addWaypoint(L, map, lat, lng);
      });
    };

    // Small delay so dialog DOM is ready
    const t = setTimeout(init, 200);
    return () => {
      clearTimeout(t);
      if (map) {
        map.remove();
        createMapInstance.current = null;
      }
    };
  }, [createOpen]);

  const addWaypoint = (L: any, map: any, lat: number, lng: number) => {
    setWaypoints((prev) => {
      const next = [...prev, [lat, lng] as [number, number]];
      // Add marker
      const idx = next.length;
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          html: `<div style="width:28px;height:28px;background:hsl(215 80% 48%);border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold">${idx}</div>`,
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).addTo(map);
      createMarkersRef.current.push(marker);

      // Update polyline
      if (createPolylineRef.current) map.removeLayer(createPolylineRef.current);
      if (next.length > 1) {
        createPolylineRef.current = L.polyline(next, {
          color: "hsl(215, 80%, 48%)",
          weight: 3,
          dashArray: "8 6",
        }).addTo(map);
      }

      return next;
    });
  };

  const clearWaypoints = () => {
    if (createMapInstance.current) {
      createMarkersRef.current.forEach((m) => createMapInstance.current.removeLayer(m));
      if (createPolylineRef.current) createMapInstance.current.removeLayer(createPolylineRef.current);
    }
    createMarkersRef.current = [];
    createPolylineRef.current = null;
    setWaypoints([]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.start_location.trim() || !form.end_location.trim()) {
      toast.error("Preencha a origem e o destino");
      return;
    }
    const { error } = await supabase.from("routes").insert({
      start_location: form.start_location.trim(),
      end_location: form.end_location.trim(),
      driver_id: form.driver_id || null,
      vehicle_id: form.vehicle_id || null,
      waypoints: waypoints.length > 0 ? waypoints.map(([lat, lng]) => ({ lat, lng })) : [],
      status: "planned" as const,
    });
    if (error) {
      toast.error("Erro ao criar rota: " + error.message);
    } else {
      toast.success("Rota criada com sucesso");
      setCreateOpen(false);
      setForm({ start_location: "", end_location: "", driver_id: "", vehicle_id: "" });
      clearWaypoints();
      fetchAll();
    }
  };

  const handleStatusChange = async (routeId: string, status: string) => {
    const { error } = await supabase.from("routes").update({ status: status as any }).eq("id", routeId);
    if (error) toast.error(error.message);
    else {
      toast.success("Estado atualizado");
      fetchAll();
    }
  };

  const handleDelete = async (routeId: string) => {
    const { error } = await supabase.from("routes").delete().eq("id", routeId);
    if (error) toast.error(error.message);
    else {
      toast.success("Rota eliminada");
      fetchAll();
    }
  };

  // View route on map
  const openViewMap = (route: RouteRow) => {
    setViewRoute(route);
    setViewOpen(true);
  };

  useEffect(() => {
    if (!viewOpen || !viewMapRef.current || !viewRoute) return;

    let map: any = null;
    const init = async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");

      if (viewMapInstance.current) {
        viewMapInstance.current.remove();
        viewMapInstance.current = null;
      }

      map = L.map(viewMapRef.current!, { zoomControl: true }).setView([39.5, -8.0], 7);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);
      viewMapInstance.current = map;

      const wp = Array.isArray(viewRoute.waypoints) ? viewRoute.waypoints : [];
      const points = wp
        .filter((w: any) => w.lat != null && w.lng != null)
        .map((w: any) => [w.lat, w.lng] as [number, number]);

      if (points.length > 0) {
        points.forEach(([lat, lng]: [number, number], i: number) => {
          L.marker([lat, lng], {
            icon: L.divIcon({
              html: `<div style="width:28px;height:28px;background:hsl(215 80% 48%);border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold">${i + 1}</div>`,
              className: "",
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            }),
          }).addTo(map);
        });

        if (points.length > 1) {
          L.polyline(points, {
            color: "hsl(215, 80%, 48%)",
            weight: 3,
            dashArray: "8 6",
          }).addTo(map);
        }

        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    };

    const t = setTimeout(init, 200);
    return () => {
      clearTimeout(t);
      if (map) {
        map.remove();
        viewMapInstance.current = null;
      }
    };
  }, [viewOpen, viewRoute]);

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return "—";
    return drivers.find((d) => d.user_id === driverId)?.full_name || "—";
  };

  const getVehiclePlate = (vehicleId: string | null) => {
    if (!vehicleId) return "—";
    return vehicles.find((v) => v.id === vehicleId)?.plate || "—";
  };

  const handleRouteImport = async (rows: Record<string, string>[]) => {
    const driverMap: Record<string, string> = {};
    drivers.forEach(d => {
      if (d.full_name) driverMap[d.full_name.toLowerCase().trim()] = d.user_id;
    });
    const vehicleMap: Record<string, string> = {};
    vehicles.forEach(v => {
      vehicleMap[v.plate.replace(/[\s-]/g, "").toUpperCase()] = v.id;
    });

    const payload = rows.map(r => {
      const driverName = (r.driver || "").toLowerCase().trim();
      const vehiclePlate = (r.vehicle || "").replace(/[\s-]/g, "").toUpperCase();
      return {
        start_location: r.start_location || null,
        end_location: r.end_location || null,
        driver_id: driverMap[driverName] || null,
        vehicle_id: vehicleMap[vehiclePlate] || null,
        status: "planned" as const,
        waypoints: [],
      };
    });

    const { error } = await supabase.from("routes").insert(payload);
    if (error) throw error;
    toast.success(`${payload.length} rota(s) importada(s)`);
    fetchAll();
  };

  const routeExportData = routes.map(r => ({
    Origem: r.start_location || "", Destino: r.end_location || "",
    Motorista: getDriverName(r.driver_id), Veículo: getVehiclePlate(r.vehicle_id),
    Estado: statusLabels[r.status] || r.status, Data: format(new Date(r.created_at), "dd/MM/yyyy"),
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-header">Gestão de Rotas</h1>
          <p className="page-subtitle">Criar e atribuir rotas a motoristas</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton
            columns={["start_location", "end_location", "driver", "vehicle"]}
            aliases={ROUTE_ALIASES}
            requiredColumns={["start_location", "end_location"]}
            validate={(r) => ({
              valid: !!r.start_location && !!r.end_location,
              error: !r.start_location ? "Origem em falta" : !r.end_location ? "Destino em falta" : undefined,
            })}
            onImport={handleRouteImport}
            templateHeader="origem;destino;motorista;veículo"
            templateExample="Lisboa;Porto;João Silva;12-AB-34"
            templateFilename="modelo_rotas.csv"
          />
          <ExportButton data={routeExportData} filenameBase="rotas" sheetName="Rotas" />
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />Nova Rota
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Origem</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Motorista</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">A carregar...</TableCell></TableRow>
              ) : routes.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma rota encontrada</TableCell></TableRow>
              ) : (
                routes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.start_location || "—"}</TableCell>
                    <TableCell>{r.end_location || "—"}</TableCell>
                    <TableCell>{getDriverName(r.driver_id)}</TableCell>
                    <TableCell className="font-mono">{getVehiclePlate(r.vehicle_id)}</TableCell>
                    <TableCell>
                      <Select value={r.status} onValueChange={(v) => handleStatusChange(r.id, v)}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <Badge variant={statusVariant[r.status]}>{statusLabels[r.status]}</Badge>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planned">Planeada</SelectItem>
                          <SelectItem value="in_progress">Em curso</SelectItem>
                          <SelectItem value="completed">Concluída</SelectItem>
                          <SelectItem value="cancelled">Cancelada</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(r.created_at), "dd/MM/yy")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openViewMap(r)} title="Ver no mapa">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r.id)} title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Route Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) clearWaypoints(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Navigation className="h-5 w-5 text-primary" />Nova Rota</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Origem *</Label>
                <Input value={form.start_location} onChange={(e) => setForm({ ...form, start_location: e.target.value })} placeholder="Ex: Lisboa" required />
              </div>
              <div className="space-y-2">
                <Label>Destino *</Label>
                <Input value={form.end_location} onChange={(e) => setForm({ ...form, end_location: e.target.value })} placeholder="Ex: Porto" required />
              </div>
              <div className="space-y-2">
                <Label>Motorista</Label>
                <Select value={form.driver_id} onValueChange={(v) => setForm({ ...form, driver_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {drivers.map((d) => (
                      <SelectItem key={d.user_id} value={d.user_id}>{d.full_name || "Sem nome"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Veículo</Label>
                <Select value={form.vehicle_id} onValueChange={(v) => setForm({ ...form, vehicle_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-primary" />
                  Pontos de passagem ({waypoints.length})
                </Label>
                {waypoints.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={clearWaypoints}>
                    Limpar pontos
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Clique no mapa para adicionar pontos de passagem</p>
              <div ref={createMapRef} className="h-[350px] rounded-lg border" />
            </div>

            <Button type="submit" className="w-full">Criar Rota</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Route on Map Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {viewRoute?.start_location} → {viewRoute?.end_location}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex gap-3 text-sm text-muted-foreground">
              <span>Motorista: <strong className="text-foreground">{getDriverName(viewRoute?.driver_id ?? null)}</strong></span>
              <span>Veículo: <strong className="text-foreground font-mono">{getVehiclePlate(viewRoute?.vehicle_id ?? null)}</strong></span>
              <Badge variant={statusVariant[viewRoute?.status || "planned"]}>{statusLabels[viewRoute?.status || "planned"]}</Badge>
            </div>
            <div ref={viewMapRef} className="h-[400px] rounded-lg border" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
