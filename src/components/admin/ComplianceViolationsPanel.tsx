import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Shield, Clock } from "lucide-react";
import { toast } from "sonner";

interface DriverCompliance {
  driver_id: string;
  driver_name: string | null;
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

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

function minutesUntilLimit(current: number, limit: number) {
  return Math.max(limit - current, 0);
}

export default function ComplianceViolationsPanel() {
  const [drivers, setDrivers] = useState<DriverCompliance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-driving-limits", {
        body: {},
      });
      if (!error && data?.results) {
        setDrivers(data.results);
      }
    } catch (err: any) {
      toast.error("Erro ao carregar compliance: " + (err.message || ""));
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Drivers at risk (< 15 mins from any violation)
  const atRisk = drivers.filter(d => {
    const contRemaining = minutesUntilLimit(d.continuous_driving_minutes, d.continuous_driving_limit);
    const dailyRemaining = minutesUntilLimit(d.daily_driving_minutes, d.daily_driving_limit);
    return contRemaining < 15 || dailyRemaining < 15 || d.warnings.length > 0 || d.violations.length > 0;
  }).sort((a, b) => {
    // Violations first, then warnings, then by remaining time
    if (a.violations.length !== b.violations.length) return b.violations.length - a.violations.length;
    if (a.warnings.length !== b.warnings.length) return b.warnings.length - a.warnings.length;
    return 0;
  });

  // Biweekly exceeded
  const biweeklyExceeded = drivers.filter(d => d.biweekly_driving_minutes >= d.biweekly_driving_limit);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-destructive" />
          <CardTitle className="text-lg">Risco de Multa — EU 561/2006</CardTitle>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground animate-pulse">A verificar limites...</p>
        ) : atRisk.length === 0 && biweeklyExceeded.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 text-success" />
            Todos os motoristas dentro dos limites legais.
          </div>
        ) : (
          <>
            {/* At-risk drivers */}
            {atRisk.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Motoristas em Risco ({atRisk.length})
                </h3>
                <div className="space-y-2">
                  {atRisk.map(d => {
                    const contRemaining = minutesUntilLimit(d.continuous_driving_minutes, d.continuous_driving_limit);
                    const dailyRemaining = minutesUntilLimit(d.daily_driving_minutes, d.daily_driving_limit);
                    const hasViolation = d.violations.length > 0;

                    return (
                      <div
                        key={d.driver_id}
                        className={`p-3 rounded-lg border ${
                          hasViolation ? "border-destructive/50 bg-destructive/5" : "border-warning/50 bg-warning/5"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{d.driver_name || d.driver_id.slice(0, 8)}</span>
                          <div className="flex gap-1">
                            {d.violations.map((v, i) => (
                              <Badge key={i} variant="destructive" className="text-[10px]">
                                {v.replace(/_/g, " ")}
                              </Badge>
                            ))}
                            {d.warnings.map((w, i) => (
                              <Badge key={i} variant="outline" className="text-warning border-warning text-[10px]">
                                {w.replace(/_/g, " ")}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Cont: {formatMinutes(contRemaining)} rest.
                          </div>
                          <div>Diário: {formatMinutes(d.daily_driving_minutes)}/{formatMinutes(d.daily_driving_limit)}</div>
                          <div>Ext 10h: {d.daily_extended_used_this_week}/2</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Biweekly exceeded */}
            {biweeklyExceeded.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  90h Quinzenal Excedido ({biweeklyExceeded.length})
                </h3>
                {biweeklyExceeded.map(d => (
                  <div key={d.driver_id} className="p-2 rounded border border-destructive/40 bg-destructive/5 text-sm">
                    <span className="font-medium">{d.driver_name || d.driver_id.slice(0, 8)}</span>
                    <span className="ml-2 text-destructive font-bold">
                      {formatMinutes(d.biweekly_driving_minutes)} / {formatMinutes(d.biweekly_driving_limit)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Weekly summary */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Resumo Semanal</h3>
              <div className="grid grid-cols-1 gap-1">
                {drivers.map(d => {
                  const weekPercent = Math.min((d.weekly_driving_minutes / d.weekly_driving_limit) * 100, 100);
                  return (
                    <div key={d.driver_id} className="flex items-center gap-2 text-xs">
                      <span className="w-28 truncate">{d.driver_name || d.driver_id.slice(0, 8)}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            weekPercent >= 100 ? "bg-destructive" : weekPercent >= 85 ? "bg-warning" : "bg-primary"
                          }`}
                          style={{ width: `${weekPercent}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground w-20 text-right">
                        {formatMinutes(d.weekly_driving_minutes)}/{formatMinutes(d.weekly_driving_limit)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
