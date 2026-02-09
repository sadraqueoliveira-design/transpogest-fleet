import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Car, Bell, Save, Globe } from "lucide-react";

export default function AntramSettings() {
  const [alertMinutes, setAlertMinutes] = useState(255);
  const [maxMinutes, setMaxMinutes] = useState(270);
  const [notifyOnAlert, setNotifyOnAlert] = useState(true);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("antram_settings").select("*").limit(1).single();
      if (data) {
        setSettingsId(data.id);
        setAlertMinutes(data.alert_minutes);
        setMaxMinutes(data.max_minutes);
        setNotifyOnAlert(data.notify_on_alert);
      }
    };
    fetch();
  }, []);

  const formatTime = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h${m.toString().padStart(2, "0")}`;
  };

  const handleSave = async () => {
    if (!settingsId) return;
    setSaving(true);
    const { error } = await supabase.from("antram_settings").update({
      alert_minutes: alertMinutes,
      max_minutes: maxMinutes,
      notify_on_alert: notifyOnAlert,
    }).eq("id", settingsId);

    if (error) {
      toast.error("Erro ao guardar configurações");
    } else {
      toast.success("Configurações guardadas com sucesso");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="page-header">Configurações ANTRAM</h1>
        <p className="page-subtitle">Configure os limites de tempo e notificações conforme regulamentação</p>
      </div>

      {/* Scope selector */}
      <div className="flex items-center gap-3">
        <Button variant="outline" className="gap-2">
          <Globe className="h-4 w-4" /> Configuração Global
        </Button>
        <Button onClick={handleSave} disabled={saving} className="bg-success hover:bg-success/90 gap-2">
          <Save className="h-4 w-4" />
          {saving ? "A guardar..." : "Guardar"}
        </Button>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Globe className="h-4 w-4" /> Configuração Global (Padrão)
      </div>

      {/* Main settings card */}
      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="flex items-start gap-3">
            <Car className="h-6 w-6 text-success mt-1" />
            <div>
              <h2 className="text-xl font-bold">Limites de Condução (Motoristas)</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Regulamentação RITT: máximo de 4h30 de condução contínua
              </p>
            </div>
          </div>

          {/* Alert minutes */}
          <div className="space-y-2">
            <Label className="text-base">Alerta de Aviso (minutos)</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                value={alertMinutes}
                onChange={e => setAlertMinutes(parseInt(e.target.value) || 0)}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">= {formatTime(alertMinutes)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Notificação enviada antes de atingir o limite</p>
          </div>

          {/* Max minutes */}
          <div className="space-y-2">
            <Label className="text-base">Limite Máximo (minutos)</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                value={maxMinutes}
                onChange={e => setMaxMinutes(parseInt(e.target.value) || 0)}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">= {formatTime(maxMinutes)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Bloqueio obrigatório com ecrã vermelho</p>
          </div>

          <Separator />

          {/* Notification toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <Bell className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">Notificação de Aviso</p>
                <p className="text-sm text-muted-foreground">
                  Enviar push notification quando atingir o tempo de aviso
                </p>
              </div>
            </div>
            <Switch checked={notifyOnAlert} onCheckedChange={setNotifyOnAlert} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
