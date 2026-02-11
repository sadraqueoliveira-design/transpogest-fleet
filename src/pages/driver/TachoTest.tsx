import { useState } from "react";
import { TachographLiveStatus } from "@/components/driver/TachoWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal } from "lucide-react";

const LIMITS = {
  continuous: 270,    // 4h30
  daily: 540,         // 9h
  dailyExtended: 600, // 10h
  weekly: 3360,       // 56h
  biweekly: 5400,     // 90h
};

function fmt(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export default function TachoTest() {
  const [continuous, setContinuous] = useState(0);
  const [daily, setDaily] = useState(0);
  const [weekly, setWeekly] = useState(0);
  const [biweekly, setBiweekly] = useState(0);
  const [extensions, setExtensions] = useState(0);

  const warnings: string[] = [];
  const violations: string[] = [];

  if (continuous >= 255) warnings.push("CONTINUOUS_NEAR");
  if (continuous >= 270) violations.push("CONTINUOUS_LIMIT_EXCEEDED");
  if (daily >= 525) warnings.push("DAILY_NEAR");
  if (daily >= LIMITS.daily) violations.push("DAILY_LIMIT_EXCEEDED");
  if (weekly >= LIMITS.weekly) violations.push("WEEKLY_LIMIT_EXCEEDED");
  if (biweekly >= LIMITS.biweekly) violations.push("BIWEEKLY_LIMIT_EXCEEDED");

  const status = {
    currentActivity: "driving" as string | null,
    currentActivityStart: new Date().toISOString() as string | null,
    continuousMinutes: continuous,
    dailyMinutes: daily,
    weeklyMinutes: weekly,
    biweeklyMinutes: biweekly,
    extensionsUsed: extensions,
    dailyLimit: extensions > 0 ? LIMITS.dailyExtended : LIMITS.daily,
    weeklyLimit: LIMITS.weekly,
    biweeklyLimit: LIMITS.biweekly,
    continuousLimit: LIMITS.continuous,
    warnings,
    violations,
  };

  const sliders = [
    { label: "Condução Contínua", value: continuous, max: 300, set: (v: number[]) => setContinuous(v[0]), zones: [
      { at: 210, label: "3h30 Verde→Amarelo" },
      { at: 255, label: "4h15 Amarelo→Vermelho" },
      { at: 270, label: "4h30 Limite" },
    ]},
    { label: "Condução Diária", value: daily, max: 660, set: (v: number[]) => setDaily(v[0]), zones: [
      { at: 525, label: "8h45 Aviso" },
      { at: 540, label: "9h Limite" },
      { at: 600, label: "10h Ext. Limite" },
    ]},
    { label: "Condução Semanal", value: weekly, max: 3600, set: (v: number[]) => setWeekly(v[0]), zones: [
      { at: 3000, label: "50h Aviso" },
      { at: 3360, label: "56h Limite" },
    ]},
    { label: "Condução Bi-Semanal", value: biweekly, max: 5700, set: (v: number[]) => setBiweekly(v[0]), zones: [
      { at: 4590, label: "76h30 85%" },
      { at: 5400, label: "90h Limite" },
    ]},
  ];

  return (
    <div className="space-y-4 animate-fade-in pb-8">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-primary" />
          Teste Visual — Tacógrafo
        </h1>
        <p className="text-sm text-muted-foreground">Arraste os sliders para simular diferentes tempos de condução</p>
      </div>

      {/* Live Widget Preview */}
      <TachographLiveStatus driverStatus={status} />

      {/* Sliders */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Controlos de Teste</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {sliders.map(s => (
            <div key={s.label} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{s.label}</span>
                <Badge variant="outline" className="text-xs font-mono">{fmt(s.value)}</Badge>
              </div>
              <Slider
                value={[s.value]}
                onValueChange={s.set}
                max={s.max}
                step={5}
                className="w-full"
              />
              <div className="flex flex-wrap gap-1.5">
                {s.zones.map(z => (
                  <button
                    key={z.at}
                    onClick={() => s.set([z.at])}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted-foreground/20 transition-colors cursor-pointer"
                  >
                    {z.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Extensions toggle */}
          <div className="space-y-2">
            <span className="text-xs font-medium">Extensões 10h usadas esta semana</span>
            <div className="flex gap-2">
              {[0, 1, 2].map(n => (
                <button
                  key={n}
                  onClick={() => setExtensions(n)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    extensions === n
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted-foreground/20"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
