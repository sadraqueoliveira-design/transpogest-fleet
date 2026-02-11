import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, MapPin, CheckCircle2, ClipboardCheck, Bell, BellOff } from "lucide-react";
import { Link } from "react-router-dom";
import TachoWidget from "@/components/driver/TachoWidget";
import { requestNotificationPermission } from "@/lib/firebase";
import { toast } from "sonner";

export default function DriverHome() {
  const { user, profile } = useAuth();
  const [vehicle, setVehicle] = useState<any>(null);
  const [route, setRoute] = useState<any>(null);
  const [checklistDone, setChecklistDone] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [requestingPush, setRequestingPush] = useState(false);

  const handleRequestPush = async () => {
    if (!user) return;
    setRequestingPush(true);
    try {
      // Check if Notification API is available
      if (typeof Notification === "undefined") {
        alert("Este browser não suporta notificações. Abra a app diretamente no browser.");
        toast.error("Este browser não suporta notificações.");
        return;
      }

      // Check if service workers are supported
      if (!("serviceWorker" in navigator)) {
        alert("Service Workers não suportados neste browser.");
        toast.error("Service Workers não suportados neste browser.");
        return;
      }

      // First request permission directly
      console.log("[PUSH] Current permission:", Notification.permission);
      const permission = await Notification.requestPermission();
      console.log("[PUSH] Permission result:", permission);

      if (permission === "denied") {
        alert("Notificações bloqueadas pelo browser. Vá às definições do site e ative as notificações.");
        setPushPermission("denied");
        return;
      }

      if (permission !== "granted") {
        alert("Permissão não concedida: " + permission);
        return;
      }

      // Now get FCM token
      const vapidKey = "VUC53U5NLEnv77O6HngJrhg0-uEsUZ1_hi6pyKGKFAU";
      const token = await requestNotificationPermission(vapidKey);
      console.log("[PUSH] FCM token result:", token ? "obtained" : "null");
      
      if (token) {
        const { error } = await supabase.from("user_fcm_tokens").upsert(
          { user_id: user.id, token, device_type: "web", last_active_at: new Date().toISOString() },
          { onConflict: "token" }
        );
        if (error) {
          alert("Erro ao guardar token: " + error.message);
        } else {
          setPushPermission("granted");
          alert("Notificações ativadas com sucesso!");
          toast.success("Notificações ativadas com sucesso!");
        }
      } else {
        alert("Não foi possível obter o token FCM. Verifique a consola (F12) para mais detalhes.");
      }
    } catch (err: any) {
      console.error("[PUSH] Error:", err);
      alert("Erro: " + (err?.message || String(err)));
    } finally {
      setRequestingPush(false);
    }
  };

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

      {/* Push Notifications */}
      {pushPermission !== "granted" && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="flex items-center gap-3 py-4">
            {pushPermission === "denied" ? (
              <>
                <BellOff className="h-5 w-5 text-destructive shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Notificações bloqueadas</p>
                  <p className="text-xs text-muted-foreground">Ative nas definições do browser para este site</p>
                </div>
              </>
            ) : (
              <>
                <Bell className="h-5 w-5 text-warning shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Ativar notificações</p>
                  <p className="text-xs text-muted-foreground">Receba alertas importantes em tempo real</p>
                </div>
                <Button size="sm" onClick={handleRequestPush} disabled={requestingPush}>
                  {requestingPush ? "A ativar..." : "Ativar"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

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
