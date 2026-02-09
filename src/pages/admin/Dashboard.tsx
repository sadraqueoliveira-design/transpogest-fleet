import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Truck, AlertTriangle, Fuel, Thermometer, CreditCard,
  RefreshCw, Bell, Navigation, Store, Warehouse
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Stats {
  total: number;
  moving: number;
  stopped: number;
  alerts: number;
  lowFuel: number;
  highTemp: number;
  cardsExpiring: number;
  cardsExpired: number;
}

interface Notification {
  id: string;
  type: "maintenance" | "request";
  message: string;
  time: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    total: 0, moving: 0, stopped: 0, alerts: 0,
    lowFuel: 0, highTemp: 0, cardsExpiring: 0, cardsExpired: 0,
  });
  const [syncing, setSyncing] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const fetchStats = async () => {
    const { data: vehicles } = await supabase.from("vehicles").select("*");
    if (!vehicles) return;

    const total = vehicles.length;
    const moving = vehicles.filter(v => (v.last_speed || 0) > 5).length;
    const stopped = vehicles.filter(v => (v.last_speed || 0) === 0).length;
    const lowFuel = vehicles.filter(v => v.fuel_level_percent != null && v.fuel_level_percent < 15).length;

    // High temp: check temperature_data for values > 8°C (reefer alert)
    const highTemp = vehicles.filter(v => {
      if (!v.temperature_data) return false;
      const td = v.temperature_data as any;
      const t1 = td?.t1 ?? td?.T1;
      const t2 = td?.t2 ?? td?.T2;
      return (typeof t1 === "number" && t1 > 8) || (typeof t2 === "number" && t2 > 8);
    }).length;

    const alerts = lowFuel + highTemp;

    // Tachograph card expiry
    const now = new Date();
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const cardsExpiring = vehicles.filter(v =>
      v.tachograph_calibration_date &&
      new Date(v.tachograph_calibration_date) <= in60Days &&
      new Date(v.tachograph_calibration_date) > now
    ).length;
    const cardsExpired = vehicles.filter(v =>
      v.tachograph_calibration_date &&
      new Date(v.tachograph_calibration_date) <= now
    ).length;

    setStats({ total, moving, stopped, alerts, lowFuel, highTemp, cardsExpiring, cardsExpired });
  };

  useEffect(() => {
    fetchStats();

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
        fetchStats();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "service_requests" }, (payload) => {
        const req = payload.new as any;
        setNotifications((prev) => [{
          id: req.id, type: "request",
          message: `Nova solicitação: ${req.type}`,
          time: new Date().toLocaleTimeString("pt-PT"),
        }, ...prev.slice(0, 19)]);
        toast.info("Nova solicitação de motorista");
        fetchStats();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "maintenance_records" }, () => fetchStats())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_requests" }, () => fetchStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-trackit-data");
      if (error) throw error;
      if (data?.success) {
        toast.success(`Sincronização concluída: ${data.updated} veículos atualizados`);
        fetchStats();
      } else {
        toast.error(data?.error || "Erro na sincronização");
      }
    } catch (err: any) {
      toast.error("Erro ao sincronizar: " + (err.message || "Erro desconhecido"));
    }
    setSyncing(false);
  };

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
    default: "",
    success: "text-success",
    destructive: "border-destructive/40 text-destructive",
    warning: "border-warning/40 text-warning",
  };

  const variantBorder: Record<string, string> = {
    default: "",
    success: "",
    destructive: "border-destructive/30",
    warning: "border-warning/30",
  };

  return (
    <div className="space-y-6 animate-fade-in">
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

      {/* Status Widget Grid - 2 columns like screenshots */}
      <div className="grid grid-cols-2 gap-3">
        {widgetCards.map((card) => (
          <Card
            key={card.label}
            className={`text-center py-4 px-3 ${variantBorder[card.variant]}`}
          >
            <CardContent className="p-0 flex flex-col items-center gap-1">
              <card.icon className={`h-6 w-6 ${variantStyles[card.variant] || "text-muted-foreground"}`} />
              <span className={`text-3xl font-bold ${variantStyles[card.variant]}`}>
                {card.value}
              </span>
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
            <div>
              <span className="text-lg font-bold">0</span>
              <p className="text-xs text-muted-foreground">Em Lojas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3 px-2">
          <CardContent className="p-0 flex items-center gap-2 justify-center">
            <Warehouse className="h-5 w-5 text-warning" />
            <div>
              <span className="text-lg font-bold">0</span>
              <p className="text-xs text-muted-foreground">Armazém/CD</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-3 px-2">
          <CardContent className="p-0 flex items-center gap-2 justify-center">
            <Navigation className="h-5 w-5 text-success" />
            <div>
              <span className="text-lg font-bold">{stats.moving}</span>
              <p className="text-xs text-muted-foreground">Em Trânsito</p>
            </div>
          </CardContent>
        </Card>
      </div>

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
