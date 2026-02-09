import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Truck, Route, Wrench, AlertTriangle, Fuel, Users, RefreshCw, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Stats {
  totalVehicles: number;
  activeRoutes: number;
  pendingMaintenance: number;
  occurrences: number;
  fuelLogs: number;
  drivers: number;
}

interface Notification {
  id: string;
  type: "maintenance" | "request";
  message: string;
  time: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalVehicles: 0,
    activeRoutes: 0,
    pendingMaintenance: 0,
    occurrences: 0,
    fuelLogs: 0,
    drivers: 0,
  });
  const [syncing, setSyncing] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const fetchStats = async () => {
    const [vehicles, routes, maintenance, occurrences, fuel, drivers] = await Promise.all([
      supabase.from("vehicles").select("id", { count: "exact", head: true }),
      supabase.from("routes").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
      supabase.from("maintenance_records").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("occurrences").select("id", { count: "exact", head: true }),
      supabase.from("fuel_logs").select("id", { count: "exact", head: true }),
      supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "driver"),
    ]);
    setStats({
      totalVehicles: vehicles.count || 0,
      activeRoutes: routes.count || 0,
      pendingMaintenance: maintenance.count || 0,
      occurrences: occurrences.count || 0,
      fuelLogs: fuel.count || 0,
      drivers: drivers.count || 0,
    });
  };

  useEffect(() => {
    fetchStats();

    // Realtime subscriptions for notifications
    const channel = supabase
      .channel("admin-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "maintenance_records" },
        (payload) => {
          const rec = payload.new as any;
          setNotifications((prev) => [
            {
              id: rec.id,
              type: "maintenance",
              message: `Nova manutenção ${rec.type === "preventive" ? "preventiva" : "corretiva"} registada`,
              time: new Date().toLocaleTimeString("pt-PT"),
            },
            ...prev.slice(0, 19),
          ]);
          toast.info("Nova manutenção registada");
          fetchStats();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "service_requests" },
        (payload) => {
          const req = payload.new as any;
          setNotifications((prev) => [
            {
              id: req.id,
              type: "request",
              message: `Nova solicitação: ${req.type}`,
              time: new Date().toLocaleTimeString("pt-PT"),
            },
            ...prev.slice(0, 19),
          ]);
          toast.info("Nova solicitação de motorista");
          fetchStats();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "maintenance_records" },
        () => fetchStats()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "service_requests" },
        () => fetchStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  const cards = [
    { label: "Veículos", value: stats.totalVehicles, icon: Truck, color: "text-primary" },
    { label: "Rotas Ativas", value: stats.activeRoutes, icon: Route, color: "text-success" },
    { label: "Manutenção Pendente", value: stats.pendingMaintenance, icon: Wrench, color: "text-warning" },
    { label: "Ocorrências", value: stats.occurrences, icon: AlertTriangle, color: "text-destructive" },
    { label: "Abastecimentos", value: stats.fuelLogs, icon: Fuel, color: "text-accent-foreground" },
    { label: "Motoristas", value: stats.drivers, icon: Users, color: "text-primary" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-header">Painel de Controlo</h1>
          <p className="page-subtitle">Visão geral do sistema de transportes</p>
        </div>
        <Button onClick={handleSync} disabled={syncing} variant="outline">
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "A sincronizar..." : "Sincronizar GPS Trackit"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label} className="stat-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Real-time notifications */}
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
