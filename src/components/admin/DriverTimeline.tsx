import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";

interface Activity {
  id: string;
  activity_type: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
}

interface Props {
  driverId: string;
}

const ACTIVITY_COLORS: Record<string, { bg: string; label: string; emoji: string }> = {
  drive: { bg: "bg-success", label: "Condução", emoji: "🟢" },
  rest: { bg: "bg-primary", label: "Descanso", emoji: "🛏️" },
  work: { bg: "bg-warning", label: "Trabalho", emoji: "🔨" },
  available: { bg: "bg-muted-foreground", label: "Disponível", emoji: "⏳" },
};

export default function DriverTimeline({ driverId }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("driver_activities")
      .select("id, activity_type, start_time, end_time, duration_minutes")
      .eq("driver_id", driverId)
      .gte("start_time", since)
      .order("start_time", { ascending: true })
      .then(({ data }) => {
        if (data) setActivities(data as Activity[]);
      });
  }, [driverId]);

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Sem dados de atividade nas últimas 24h
        </CardContent>
      </Card>
    );
  }

  // Calculate timeline: 24h window
  const windowStart = Date.now() - 24 * 60 * 60 * 1000;
  const windowEnd = Date.now();
  const totalMs = windowEnd - windowStart;

  // Compute totals per type
  const totals: Record<string, number> = {};
  activities.forEach((a) => {
    const mins = a.duration_minutes || 0;
    totals[a.activity_type] = (totals[a.activity_type] || 0) + mins;
  });

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <p className="text-sm font-semibold">Atividade do Motorista (24h)</p>

        {/* Timeline bar */}
        <div className="relative h-8 w-full rounded-md overflow-hidden bg-muted flex">
          {activities.map((a) => {
            const start = Math.max(new Date(a.start_time).getTime(), windowStart);
            const end = a.end_time ? Math.min(new Date(a.end_time).getTime(), windowEnd) : windowEnd;
            const leftPct = ((start - windowStart) / totalMs) * 100;
            const widthPct = ((end - start) / totalMs) * 100;
            const cfg = ACTIVITY_COLORS[a.activity_type] || ACTIVITY_COLORS.available;

            return (
              <div
                key={a.id}
                className={`absolute inset-y-0 ${cfg.bg} opacity-85`}
                style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 0.5)}%` }}
                title={`${cfg.label}: ${format(new Date(a.start_time), "HH:mm")} - ${a.end_time ? format(new Date(a.end_time), "HH:mm") : "agora"}`}
              />
            );
          })}
          {/* Time markers */}
          {[0, 6, 12, 18].map((h) => {
            const markerTime = new Date(windowStart);
            markerTime.setMinutes(0, 0, 0);
            markerTime.setHours(markerTime.getHours() + h + (24 - new Date(windowStart).getHours()));
            const pct = ((markerTime.getTime() - windowStart) / totalMs) * 100;
            if (pct < 0 || pct > 100) return null;
            return (
              <div key={h} className="absolute inset-y-0 w-px bg-foreground/20" style={{ left: `${pct}%` }}>
                <span className="absolute -top-4 -translate-x-1/2 text-[9px] text-muted-foreground">
                  {format(markerTime, "HH:mm")}
                </span>
              </div>
            );
          })}
        </div>

        {/* Legend + totals */}
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries(ACTIVITY_COLORS).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`h-3 w-3 rounded-sm ${cfg.bg}`} />
              <span className="text-muted-foreground">{cfg.label}</span>
              {totals[key] != null && (
                <span className="font-semibold">{Math.round(totals[key])}m</span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
