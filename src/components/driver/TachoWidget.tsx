import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BedDouble, Clock, Calendar, CalendarRange, AlertTriangle, Truck, Wrench, Coffee, CreditCard, RefreshCw } from "lucide-react";

// === Types ===

interface DriverStatus {
  currentActivity: string | null;
  currentActivityStart: string | null;
  cardInserted: boolean;
  continuousMinutes: number;
  dailyMinutes: number;
  weeklyMinutes: number;
  biweeklyMinutes: number;
  extensionsUsed: number;
  dailyLimit: number;
  weeklyLimit: number;
  biweeklyLimit: number;
  continuousLimit: number;
  warnings: string[];
  violations: string[];
}

// === Constants (EU 561/2006) ===
const CONTINUOUS_SAFE = 210;     // 3h30 → green
const CONTINUOUS_PREPARE = 255;  // 4h15 → yellow
const DAILY_WARNING = 525;       // 8h45

// === Helpers ===

function fmt(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h${m.toString().padStart(2, "0")}`;
}

function fmtTimer(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

// === Sub-components ===

function CockpitRing({ value, max }: { value: number; max: number }) {
  const size = 180;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.min((value / max) * 100, 100);
  const offset = circumference - (percent / 100) * circumference;
  const remaining = Math.max(max - value, 0);

  // Color logic: 0-3h30 green, 3h30-4h15 yellow, >4h15 red
  let strokeClass = "text-emerald-500";
  let glowClass = "";
  let isPulsing = false;

  if (value >= CONTINUOUS_PREPARE) {
    strokeClass = "text-red-500";
    glowClass = "drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]";
    isPulsing = true;
  } else if (value >= CONTINUOUS_SAFE) {
    strokeClass = "text-amber-400";
    glowClass = "drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]";
  }

  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${isPulsing ? "animate-pulse" : ""}`} style={{ width: size, height: size }}>
        <svg width={size} height={size} className={`-rotate-90 ${glowClass}`}>
          {/* Track */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="currentColor"
            className="text-muted/30" strokeWidth={strokeWidth}
          />
          {/* Progress */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="currentColor"
            className={`${strokeClass} transition-all duration-1000 ease-out`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-mono font-black tracking-tight">
            {fmtTimer(value)}
          </span>
          <span className="text-[11px] text-muted-foreground font-medium mt-0.5">
            Condução Contínua
          </span>
        </div>
      </div>
      {/* Countdown below */}
      <p className="text-xs text-muted-foreground mt-2 text-center">
        {remaining <= 0 ? (
          <span className="text-destructive font-bold">Pausa obrigatória agora!</span>
        ) : (
          <>Pausa obrigatória em: <span className="font-semibold text-foreground">{fmt(remaining)}</span></>
        )}
      </p>
    </div>
  );
}

function MetricCard({ icon: Icon, label, children, className = "" }: {
  icon: any; label: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-xl border bg-card/50 p-3 space-y-1.5 ${className}`}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      {children}
    </div>
  );
}

function DailyCard({ minutes, limit, extensionsUsed }: { minutes: number; limit: number; extensionsUsed: number }) {
  const percent = Math.min((minutes / limit) * 100, 100);
  const barColor = minutes >= limit
    ? "bg-destructive"
    : minutes >= limit * 0.9
    ? "bg-amber-400"
    : "bg-emerald-500";

  return (
    <MetricCard icon={Clock} label="Diário">
      <p className="text-sm font-semibold">{fmt(minutes)} <span className="text-muted-foreground font-normal">/ {fmt(limit)}</span></p>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${percent}%` }} />
      </div>
      {/* Extension dots */}
      <div className="flex items-center gap-1.5 pt-0.5">
        <span className="text-[10px] text-muted-foreground">Ext. 10h:</span>
        {[0, 1].map(i => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full border-[1.5px] transition-colors ${
              i < extensionsUsed
                ? "bg-amber-400 border-amber-500"
                : "bg-transparent border-muted-foreground/25"
            }`}
          />
        ))}
      </div>
    </MetricCard>
  );
}

function WeeklyCard({ minutes, limit }: { minutes: number; limit: number }) {
  const color = minutes >= limit
    ? "text-destructive"
    : minutes >= 3000 // 50h
    ? "text-amber-400"
    : "text-emerald-500";

  return (
    <MetricCard icon={Calendar} label="Semanal">
      <p className={`text-sm font-semibold ${color}`}>
        {fmt(minutes)} <span className="text-muted-foreground font-normal">/ {fmt(limit)}</span>
      </p>
    </MetricCard>
  );
}

function BiweeklyCard({ minutes, limit }: { minutes: number; limit: number }) {
  const percent = Math.min((minutes / limit) * 100, 100);
  const color = percent >= 100 ? "text-destructive" : percent >= 85 ? "text-amber-400" : "text-foreground";

  return (
    <MetricCard icon={CalendarRange} label="Bi-Semanal">
      <p className={`text-sm font-semibold ${color}`}>
        {fmt(minutes)} <span className="text-muted-foreground font-normal">/ {fmt(limit)}</span>
      </p>
    </MetricCard>
  );
}

function RestCard() {
  return (
    <MetricCard icon={BedDouble} label="Próximo Repouso">
      <p className="text-sm font-semibold">45min <span className="text-muted-foreground font-normal">(Regular)</span></p>
      <p className="text-[10px] text-muted-foreground">ou 15+30 (Dividido)</p>
    </MetricCard>
  );
}

// === Alert Banners ===

function AlertBanners({ status }: { status: DriverStatus }) {
  const alerts: { message: string; variant: "critical" | "warning" }[] = [];

  if (status.continuousMinutes >= CONTINUOUS_PREPARE) {
    alerts.push({ message: "⚠ PAUSA DE 45 MIN NECESSÁRIA AGORA!", variant: "critical" });
  }
  if (status.dailyMinutes >= DAILY_WARNING) {
    alerts.push({ message: "⚠ Fim de turno aproxima-se.", variant: "warning" });
  }
  if (status.violations.includes("WEEKLY_LIMIT_EXCEEDED")) {
    alerts.push({ message: "🚨 Limite semanal de 56h excedido!", variant: "critical" });
  }
  if (status.violations.includes("BIWEEKLY_LIMIT_EXCEEDED")) {
    alerts.push({ message: "🚨 Limite bi-semanal de 90h excedido!", variant: "critical" });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {alerts.map((alert, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
            alert.variant === "critical"
              ? "bg-destructive/15 text-destructive border border-destructive/30 animate-pulse"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {alert.message}
        </div>
      ))}
    </div>
  );
}

// === Activity Status Badge ===

const ACTIVITY_CONFIG: Record<string, { label: string; icon: any; className: string }> = {
  driving: { label: "A Conduzir", icon: Truck, className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  work: { label: "Em Trabalho", icon: Wrench, className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  available: { label: "Disponível", icon: Coffee, className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  rest: { label: "Em Repouso", icon: BedDouble, className: "bg-muted text-muted-foreground border-muted-foreground/20" },
};

function ActivityBadge({ activity, since, cardInserted }: { activity: string | null; since: string | null; cardInserted: boolean }) {
  if (!cardInserted) {
    return (
      <div className="flex items-center justify-between rounded-lg px-3 py-2 border bg-destructive/10 text-destructive border-destructive/30">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          <span className="text-sm font-semibold">Sem Cartão</span>
        </div>
        <span className="text-xs opacity-75">Cartão não inserido</span>
      </div>
    );
  }

  const config = activity ? ACTIVITY_CONFIG[activity] : null;
  if (!config) return null;

  const Icon = config.icon;
  const sinceStr = since ? new Date(since).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 border ${config.className}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="text-sm font-semibold">{config.label}</span>
      </div>
      {sinceStr && <span className="text-xs opacity-75">desde {sinceStr}</span>}
    </div>
  );
}

// === Main Component ===

export function TachographLiveStatus({ driverStatus }: { driverStatus: DriverStatus }) {
  const noCard = !driverStatus.cardInserted;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-4">
        {/* Current Activity State */}
        <ActivityBadge activity={driverStatus.currentActivity} since={driverStatus.currentActivityStart} cardInserted={driverStatus.cardInserted} />

        {noCard ? (
          /* Card removed — show daily summary only */
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">Resumo do dia</p>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard icon={Clock} label="Condução Hoje">
                <p className="text-sm font-semibold">{fmt(driverStatus.dailyMinutes)}</p>
              </MetricCard>
              <MetricCard icon={Calendar} label="Condução Semanal">
                <p className="text-sm font-semibold">{fmt(driverStatus.weeklyMinutes)}</p>
              </MetricCard>
            </div>
          </div>
        ) : (
          /* Card inserted — full cockpit view */
          <>
            {/* Smart Alerts */}
            <AlertBanners status={driverStatus} />

            {/* Cockpit Ring */}
            <CockpitRing value={driverStatus.continuousMinutes} max={driverStatus.continuousLimit} />

            {/* 2x2 Metrics Grid */}
            <div className="grid grid-cols-2 gap-2">
              <DailyCard
                minutes={driverStatus.dailyMinutes}
                limit={driverStatus.dailyLimit}
                extensionsUsed={driverStatus.extensionsUsed}
              />
              <WeeklyCard minutes={driverStatus.weeklyMinutes} limit={driverStatus.weeklyLimit} />
              <BiweeklyCard minutes={driverStatus.biweeklyMinutes} limit={driverStatus.biweeklyLimit} />
              <RestCard />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// === Connected Wrapper (fetches data from edge function) ===

export default function TachoWidget() {
  const { user } = useAuth();
  const [status, setStatus] = useState<DriverStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCompliance = async (showRefresh = false) => {
    if (!user) return;
    if (showRefresh) setRefreshing(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("check-driving-limits", {
        body: { driver_id: user.id },
      });
      if (!error && res?.results?.length > 0) {
        const d = res.results[0];
        setStatus({
          currentActivity: d.current_activity || null,
          currentActivityStart: d.current_activity_start || null,
          cardInserted: d.card_inserted !== false,
          continuousMinutes: d.continuous_driving_minutes,
          dailyMinutes: d.daily_driving_minutes,
          weeklyMinutes: d.weekly_driving_minutes,
          biweeklyMinutes: d.biweekly_driving_minutes,
          extensionsUsed: d.daily_extended_used_this_week,
          dailyLimit: d.daily_driving_limit,
          weeklyLimit: d.weekly_driving_limit,
          biweeklyLimit: d.biweekly_driving_limit,
          continuousLimit: d.continuous_driving_limit,
          warnings: d.warnings || [],
          violations: d.violations || [],
        });
      }
    } catch {
      // silently fail
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchCompliance();
    const interval = setInterval(() => fetchCompliance(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center h-40">
          <div className="animate-pulse text-sm text-muted-foreground">A carregar tacógrafo digital...</div>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground">Sem dados de condução disponíveis</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <TachographLiveStatus driverStatus={status} />
      <button
        onClick={() => fetchCompliance(true)}
        disabled={refreshing}
        className="w-full flex items-center justify-center gap-2 rounded-lg border bg-card/50 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors active:scale-[0.98] disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        {refreshing ? "A atualizar..." : "Atualizar agora"}
      </button>
    </div>
  );
}
