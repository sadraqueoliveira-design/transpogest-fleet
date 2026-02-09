import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Truck, Navigation, Fuel, Gauge, Compass, Snowflake, CreditCard, Clock
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

  // Temperature data
  const td = v.temperature_data as any;
  const t1 = td?.t1 ?? td?.T1;
  const t2 = td?.t2 ?? td?.T2;
  const hasTemp = typeof t1 === "number" || typeof t2 === "number";

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(v.updated_at), { addSuffix: false, locale: pt });
    } catch {
      return "N/A";
    }
  })();

  return (
    <Card className={`overflow-hidden ${hasAlert ? "border-destructive/40" : ""}`}>
      <CardContent className="p-4 space-y-3">
        {/* Header: plate + speed badge */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isMoving ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-base">{v.plate}</p>
              <p className="text-xs text-muted-foreground">
                {v.brand && v.model ? `${v.brand} ${v.model}` : v.plate}
              </p>
            </div>
          </div>
          <Badge variant={isMoving ? "default" : "secondary"} className={isMoving ? "bg-success/10 text-success border-success/20" : ""}>
            <Navigation className="h-3 w-3 mr-1" />
            {speed} km/h
          </Badge>
        </div>

        {/* Telemetry strip */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Compass className="h-3.5 w-3.5" />
            {v.last_lat ? `${v.last_lat.toFixed(2)}°` : "—"}
          </span>
          <span className="flex items-center gap-1">
            <Fuel className="h-3.5 w-3.5" />
            {v.fuel_level_percent != null ? `${v.fuel_level_percent}%` : "—"}
          </span>
          {v.odometer_km != null && (
            <span className="flex items-center gap-1">
              <Gauge className="h-3.5 w-3.5" />
              {Math.round(v.odometer_km).toLocaleString("pt-PT")} km
            </span>
          )}
        </div>

        {/* Cold chain section */}
        {hasTemp && (
          <div className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/10 px-3 py-2 text-xs">
            <Snowflake className="h-4 w-4 text-primary" />
            <span className="font-medium text-primary">Frio:</span>
            {typeof t1 === "number" && <span className="text-primary">T1: {t1.toFixed(1)}°C</span>}
            {typeof t2 === "number" && <span className="text-primary">T2: {t2.toFixed(1)}°C</span>}
          </div>
        )}

        {/* Tachograph */}
        {v.tachograph_status && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
            <CreditCard className="h-3.5 w-3.5" />
            <span>Tacógrafo: {v.tachograph_status}</span>
          </div>
        )}

        {/* Footer: staff + GPS time */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
          <span>{v.current_driver_id ? "Motorista atribuído" : "Sem staff atribuído"}</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Sync: há {timeAgo}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
