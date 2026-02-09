import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Truck, Route, Wrench, AlertTriangle, Fuel, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Stats {
  totalVehicles: number;
  activeRoutes: number;
  pendingMaintenance: number;
  occurrences: number;
  fuelLogs: number;
  drivers: number;
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

  useEffect(() => {
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
    fetchStats();
  }, []);

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
      <div>
        <h1 className="page-header">Painel de Controlo</h1>
        <p className="page-subtitle">Visão geral do sistema de transportes</p>
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
    </div>
  );
}
