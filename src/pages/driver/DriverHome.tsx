import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, MapPin, CheckCircle2, ClipboardCheck, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import TachoWidget from "@/components/driver/TachoWidget";

export default function DriverHome() {
  const { user, profile } = useAuth();
  const [vehicle, setVehicle] = useState<any>(null);
  const [route, setRoute] = useState<any>(null);
  const [checklistDone, setChecklistDone] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: v } = await supabase.from("vehicles").select("*").eq("current_driver_id", user.id).maybeSingle();
      if (v) setVehicle(v);
      const { data: r } = await supabase.from("routes").select("*").eq("driver_id", user.id).eq("status", "in_progress").maybeSingle();
      if (r) setRoute(r);
      // Check today's checklist
      const today = new Date().toISOString().split("T")[0];
      const { count } = await supabase.from("checklist_submissions").select("id", { count: "exact", head: true }).eq("driver_id", user.id).gte("created_at", today);
      if (count && count > 0) setChecklistDone(true);
    };
    fetch();
  }, [user]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold">Olá, {profile?.full_name?.split(" ")[0] || "Motorista"} 👋</h1>
        <p className="text-sm text-muted-foreground">Bem-vindo ao TranspoGest</p>
      </div>

      {/* Legal Status Widget */}
      <TachoWidget />

      {/* Temporary test link */}
      <Link to="/motorista/tacho-test">
        <Button variant="outline" className="w-full gap-2 border-dashed">
          <SlidersHorizontal className="h-4 w-4" />
          Teste Visual — Tacógrafo (Slider)
        </Button>
      </Link>

      {/* Assigned Vehicle */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <Truck className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Veículo Atribuído</CardTitle>
        </CardHeader>
        <CardContent>
          {vehicle ? (
            <div className="space-y-1">
              <p className="text-lg font-mono font-bold">{vehicle.plate}</p>
              <p className="text-sm text-muted-foreground">{[vehicle.brand, vehicle.model].filter(Boolean).join(" ")}</p>
              {vehicle.fuel_level_percent != null && <p className="text-sm">Combustível: {vehicle.fuel_level_percent}%</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum veículo atribuído</p>
          )}
        </CardContent>
      </Card>

      {/* Current Route */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <MapPin className="h-5 w-5 text-success" />
          <CardTitle className="text-base">Rota Atual</CardTitle>
        </CardHeader>
        <CardContent>
          {route ? (
            <div className="space-y-1">
              <p className="text-sm"><span className="text-muted-foreground">De:</span> {route.start_location}</p>
              <p className="text-sm"><span className="text-muted-foreground">Para:</span> {route.end_location}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem rota ativa</p>
          )}
        </CardContent>
      </Card>

      {/* Daily Checklist */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <ClipboardCheck className="h-5 w-5 text-warning" />
          <CardTitle className="text-base">Checklist Diário</CardTitle>
        </CardHeader>
        <CardContent>
          {checklistDone ? (
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">Checklist concluído hoje</span>
            </div>
          ) : (
            <Link to="/motorista/checklist">
              <Button className="w-full" size="lg">Iniciar Checklist</Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
