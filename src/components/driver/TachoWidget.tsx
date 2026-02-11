import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle } from "lucide-react";

interface ComplianceData {
  continuous_driving_minutes: number;
  continuous_driving_limit: number;
  daily_driving_minutes: number;
  daily_driving_limit: number;
  daily_extended_used_this_week: number;
  weekly_driving_minutes: number;
  weekly_driving_limit: number;
  biweekly_driving_minutes: number;
  biweekly_driving_limit: number;
  warnings: string[];
  violations: string[];
}

function CircularProgress({ value, max, size = 120, strokeWidth = 10, color = "hsl(var(--primary))", warningColor = "hsl(var(--warning))", dangerColor = "hsl(var(--destructive))" }: {
  value: number; max: number; size?: number; strokeWidth?: number;
  color?: string; warningColor?: string; dangerColor?: string;
}) {
  const percent = Math.min((value / max) * 100, 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const remaining = Math.max(max - value, 0);
  const hours = Math.floor(remaining / 60);
  const mins = remaining % 60;

  let strokeColor = color;
  if (percent >= 100) strokeColor = dangerColor;
  else if (percent >= 85) strokeColor = warningColor;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={strokeColor} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold">{hours}h{mins.toString().padStart(2, "0")}</span>
        <span className="text-[10px] text-muted-foreground">restante</span>
      </div>
    </div>
  );
}

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export default function TachoWidget() {
  const { user } = useAuth();
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchCompliance = async () => {
      try {
        const { data: res, error } = await supabase.functions.invoke("check-driving-limits", {
          body: { driver_id: user.id },
        });
        if (!error && res?.results?.length > 0) {
          setData(res.results[0]);
        }
      } catch {
        // silently fail
      }
      setLoading(false);
    };
    fetchCompliance();
    // Refresh every 5 minutes
    const interval = setInterval(fetchCompliance, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center h-32">
          <div className="animate-pulse text-sm text-muted-foreground">A carregar estado legal...</div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Sem dados de condução disponíveis</p>
        </CardContent>
      </Card>
    );
  }

  const hasWarnings = data.warnings.length > 0;
  const hasViolations = data.violations.length > 0;
  const borderClass = hasViolations ? "border-destructive/50" : hasWarnings ? "border-warning/50" : "";

  return (
    <Card className={borderClass}>
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        {hasViolations ? (
          <AlertTriangle className="h-5 w-5 text-destructive" />
        ) : (
          <Shield className="h-5 w-5 text-primary" />
        )}
        <CardTitle className="text-base">Estado Legal (EU 561/2006)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Circular progress for continuous driving */}
        <div className="flex items-center gap-4">
          <CircularProgress
            value={data.continuous_driving_minutes}
            max={data.continuous_driving_limit}
          />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium">Condução Contínua</p>
            <p className="text-xs text-muted-foreground">
              Conduziste {formatMinutes(data.continuous_driving_minutes)}.{" "}
              {data.continuous_driving_minutes >= data.continuous_driving_limit
                ? <span className="text-destructive font-bold">Pausa obrigatória!</span>
                : `Tens ${formatMinutes(data.continuous_driving_limit - data.continuous_driving_minutes)} restante.`
              }
            </p>
            {/* Alerts */}
            {data.warnings.includes("CONTINUOUS_LIMIT_NEAR") && (
              <Badge variant="outline" className="text-warning border-warning text-[10px]">
                ⚠️ Pausa em breve
              </Badge>
            )}
            {data.violations.includes("CONTINUOUS_LIMIT_EXCEEDED") && (
              <Badge variant="destructive" className="text-[10px]">
                🚨 Limite ultrapassado
              </Badge>
            )}
          </div>
        </div>

        {/* Daily driving bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span>Diário: {formatMinutes(data.daily_driving_minutes)}</span>
            <span className="text-muted-foreground">/ {formatMinutes(data.daily_driving_limit)}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                data.daily_driving_minutes >= data.daily_driving_limit
                  ? "bg-destructive"
                  : data.daily_driving_minutes >= data.daily_driving_limit * 0.85
                  ? "bg-warning"
                  : "bg-primary"
              }`}
              style={{ width: `${Math.min((data.daily_driving_minutes / data.daily_driving_limit) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* 10h extension indicators */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Extensões 10h:</span>
          <div className="flex gap-1">
            {[0, 1].map(i => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 ${
                  i < data.daily_extended_used_this_week
                    ? "bg-warning border-warning"
                    : "bg-transparent border-muted-foreground/30"
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground">
            ({data.daily_extended_used_this_week}/2 usadas esta semana)
          </span>
        </div>

        {/* Weekly and biweekly compact */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-muted/50">
            <span className="text-muted-foreground">Semanal</span>
            <p className="font-medium">{formatMinutes(data.weekly_driving_minutes)} / {formatMinutes(data.weekly_driving_limit)}</p>
          </div>
          <div className="p-2 rounded bg-muted/50">
            <span className="text-muted-foreground">Quinzenal</span>
            <p className="font-medium">{formatMinutes(data.biweekly_driving_minutes)} / {formatMinutes(data.biweekly_driving_limit)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
