import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Truck, Navigation, Fuel, Gauge, Snowflake, CreditCard, Clock,
  Activity, Droplets, AlertTriangle, MapPin
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

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
}

interface Props {
  vehicle: Vehicle;
  hasAlert: boolean;
}

export default function VehicleCard({ vehicle: v, hasAlert }: Props) {
  const speed = v.last_speed || 0;
  const isMoving = speed > 5;
  const fuel = v.fuel_level_percent;
  const lowFuel = fuel != null && fuel < 15;

  // Temperature data
  const td = v.temperature_data as any;
  const t1 = td?.t1 ?? td?.T1 ?? td?.tp1;
  const t2 = td?.t2 ?? td?.T2 ?? td?.tp2;
  const hasTemp = typeof t1 === "number" || typeof t2 === "number";
  const highTemp = (typeof t1 === "number" && t1 > 8) || (typeof t2 === "number" && t2 > 8);

  // Tachograph driver info
  let tachDriver: string | null = null;
  if (v.tachograph_status) {
    try {
      const drs = JSON.parse(v.tachograph_status);
      tachDriver = drs?.d1?.name || drs?.driver1 || (typeof drs === "string" ? drs : null);
    } catch {
      tachDriver = v.tachograph_status;
    }
  }

  const timeAgo = (() => {
    try { return formatDistanceToNow(new Date(v.updated_at), { addSuffix: false, locale: pt }); }
    catch { return "N/A"; }
  })();

  const fuelColor = lowFuel ? "bg-destructive" : fuel != null && fuel < 30 ? "bg-warning" : "bg-success";

  return (
    <Card className={`overflow-hidden transition-shadow hover:shadow-md ${hasAlert ? "border-destructive/50 shadow-destructive/10" : ""}`}>
      <CardContent className="p-0">
        {/* Top status bar */}
        <div className={`h-1 w-full ${isMoving ? "bg-success" : hasAlert ? "bg-destructive" : "bg-muted"}`} />

        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${isMoving ? "bg-success/10 text-success" : hasAlert ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-base tracking-wide">{v.plate}</p>
                <p className="text-xs text-muted-foreground">
                  {v.brand && v.model ? `${v.brand} ${v.model}` : "—"}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant={isMoving ? "default" : "secondary"} className={isMoving ? "bg-success text-white" : ""}>
                <Navigation className="h-3 w-3 mr-1" />
                {speed} km/h
              </Badge>
              {v.rpm != null && (
                <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
                  <Activity className="h-3 w-3" />{v.rpm} rpm
                </span>
              )}
            </div>
          </div>

          {/* Fuel bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Fuel className="h-3.5 w-3.5" />
                Combustível
              </span>
              <span className={`font-semibold ${lowFuel ? "text-destructive" : ""}`}>
                {fuel != null ? `${fuel}%` : "—"}
              </span>
            </div>
            {fuel != null && (
              <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${fuelColor}`} style={{ width: `${Math.min(fuel, 100)}%` }} />
              </div>
            )}
            {lowFuel && (
              <div className="flex items-center gap-1 text-[11px] text-destructive font-medium">
                <AlertTriangle className="h-3 w-3" />
                Nível de combustível baixo
              </div>
            )}
          </div>

          {/* Telemetry grid */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <Gauge className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-0.5" />
              <p className="font-semibold">{v.odometer_km != null ? `${Math.round(v.odometer_km).toLocaleString("pt-PT")}` : "—"}</p>
              <p className="text-[10px] text-muted-foreground">km</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <Activity className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-0.5" />
              <p className="font-semibold">{v.engine_hours != null ? Math.round(v.engine_hours).toLocaleString("pt-PT") : "—"}</p>
              <p className="text-[10px] text-muted-foreground">h motor</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <MapPin className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-0.5" />
              <p className="font-semibold">{v.last_lat ? `${v.last_lat.toFixed(2)}°` : "—"}</p>
              <p className="text-[10px] text-muted-foreground">GPS</p>
            </div>
          </div>

          {/* Cold chain */}
          {hasTemp && (
            <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs border ${highTemp ? "bg-destructive/5 border-destructive/20" : "bg-primary/5 border-primary/10"}`}>
              <Snowflake className={`h-4 w-4 ${highTemp ? "text-destructive" : "text-primary"}`} />
              <div className="flex items-center gap-3 flex-1">
                {typeof t1 === "number" && (
                  <div>
                    <span className="text-[10px] text-muted-foreground">T1</span>
                    <p className={`font-bold text-sm ${t1 > 8 ? "text-destructive" : "text-primary"}`}>{t1.toFixed(1)}°C</p>
                  </div>
                )}
                {typeof t2 === "number" && (
                  <div>
                    <span className="text-[10px] text-muted-foreground">T2</span>
                    <p className={`font-bold text-sm ${t2 > 8 ? "text-destructive" : "text-primary"}`}>{t2.toFixed(1)}°C</p>
                  </div>
                )}
              </div>
              {highTemp && (
                <Badge variant="destructive" className="text-[10px] h-5">
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Alerta
                </Badge>
              )}
            </div>
          )}

          {/* Tachograph driver */}
          {tachDriver && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <CreditCard className="h-3.5 w-3.5" />
              <span>Tacógrafo: <span className="font-medium text-foreground">{tachDriver}</span></span>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t">
            <span>{v.current_driver_id ? "Motorista atribuído" : "Sem motorista"}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              há {timeAgo}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
