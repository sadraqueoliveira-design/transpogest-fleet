import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CreditCard, Truck } from "lucide-react";

interface OverdueItem {
  name: string;
  type: "card" | "vehicle";
  dueDate: string | null;
  daysOverdue: number;
}

export default function ComplianceWidget() {
  const [overdue, setOverdue] = useState<OverdueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const now = new Date();
      const items: OverdueItem[] = [];

      // Tacho cards: overdue if last_card_download_at > 28 days ago or next_card_download_due < now
      const { data: profiles } = await supabase
        .from("profiles")
        .select("full_name, last_card_download_at, next_card_download_due");

      if (profiles) {
        for (const p of profiles) {
          const profile = p as any;
          if (!profile.last_card_download_at && !profile.next_card_download_due) continue;
          let isOverdue = false;
          let daysOver = 0;

          if (profile.next_card_download_due) {
            const due = new Date(profile.next_card_download_due);
            if (due < now) {
              isOverdue = true;
              daysOver = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
            }
          } else if (profile.last_card_download_at) {
            const last = new Date(profile.last_card_download_at);
            const daysSince = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince > 28) {
              isOverdue = true;
              daysOver = daysSince - 28;
            }
          }

          if (isOverdue) {
            items.push({
              name: profile.full_name || "Motorista",
              type: "card",
              dueDate: profile.next_card_download_due,
              daysOverdue: daysOver,
            });
          }
        }
      }

      // Vehicle units: overdue if > 90 days
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("plate, last_vehicle_unit_download_at, next_vehicle_unit_download_due");

      if (vehicles) {
        for (const vRaw of vehicles) {
          const v = vRaw as any;
          if (!v.last_vehicle_unit_download_at && !v.next_vehicle_unit_download_due) continue;
          let isOverdue = false;
          let daysOver = 0;

          if (v.next_vehicle_unit_download_due) {
            const due = new Date(v.next_vehicle_unit_download_due);
            if (due < now) {
              isOverdue = true;
              daysOver = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
            }
          } else if (v.last_vehicle_unit_download_at) {
            const last = new Date(v.last_vehicle_unit_download_at);
            const daysSince = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince > 90) {
              isOverdue = true;
              daysOver = daysSince - 90;
            }
          }

          if (isOverdue) {
            items.push({
              name: v.plate,
              type: "vehicle",
              dueDate: v.next_vehicle_unit_download_due,
              daysOverdue: daysOver,
            });
          }
        }
      }

      items.sort((a, b) => b.daysOverdue - a.daysOverdue);
      setOverdue(items);
      setLoading(false);
    };
    fetch();
  }, []);

  const cardOverdue = overdue.filter((i) => i.type === "card").length;
  const vehicleOverdue = overdue.filter((i) => i.type === "vehicle").length;

  if (loading) return null;
  if (overdue.length === 0) return null;

  return (
    <Card className="border-warning/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span className="text-sm font-semibold">Compliance — Downloads em Atraso</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg border p-2">
            <CreditCard className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-xl font-bold text-warning">{cardOverdue}</p>
            <p className="text-[10px] text-muted-foreground">Cartões Tacho (&gt;28d)</p>
          </div>
          <div className="rounded-lg border p-2">
            <Truck className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-xl font-bold text-warning">{vehicleOverdue}</p>
            <p className="text-[10px] text-muted-foreground">Unidades Veículo (&gt;90d)</p>
          </div>
        </div>

        {overdue.length > 0 && (
          <div className="max-h-32 overflow-y-auto space-y-1">
            {overdue.slice(0, 8).map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                <div className="flex items-center gap-1.5">
                  {item.type === "card" ? <CreditCard className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                  <span>{item.name}</span>
                </div>
                <Badge variant="destructive" className="text-[10px] h-5">
                  +{item.daysOverdue}d
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
