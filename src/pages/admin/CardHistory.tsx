import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Search, Clock } from "lucide-react";
import { ExportButton } from "@/components/admin/BulkImportExport";

interface CardEvent {
  id: string;
  vehicle_id: string | null;
  plate: string;
  card_number: string | null;
  driver_name: string | null;
  employee_number: number | null;
  event_type: string;
  event_at: string;
  created_at: string;
}

interface CardSession {
  key: string;
  driver_name: string | null;
  employee_number: number | null;
  plate: string;
  inserted_at: string | null;
  removed_at: string | null;
}

const formatLisbon = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const formatDuration = (insertedAt: string, removedAt: string): string => {
  const ms = new Date(removedAt).getTime() - new Date(insertedAt).getTime();
  if (ms < 0) return "—";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const pairEvents = (events: CardEvent[]): CardSession[] => {
  const sorted = [...events].sort(
    (a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime()
  );

  const sessions: CardSession[] = [];
  const usedIds = new Set<string>();

  // First pass: match each inserted with the next removed of same card+plate
  const insertions = sorted.filter((e) => e.event_type === "inserted");
  const removals = sorted.filter((e) => e.event_type === "removed");

  for (const ins of insertions) {
    const matchKey = `${ins.card_number ?? ins.driver_name}__${ins.plate}`;
    const removal = removals.find(
      (r) =>
        !usedIds.has(r.id) &&
        `${r.card_number ?? r.driver_name}__${r.plate}` === matchKey &&
        new Date(r.event_at).getTime() > new Date(ins.event_at).getTime()
    );

    usedIds.add(ins.id);
    if (removal) usedIds.add(removal.id);

    sessions.push({
      key: ins.id,
      driver_name: ins.driver_name,
      employee_number: ins.employee_number,
      plate: ins.plate,
      inserted_at: ins.event_at,
      removed_at: removal?.event_at ?? null,
    });
  }

  // Second pass: orphan removals (no matching insertion)
  for (const rem of removals) {
    if (!usedIds.has(rem.id)) {
      sessions.push({
        key: rem.id,
        driver_name: rem.driver_name,
        employee_number: rem.employee_number,
        plate: rem.plate,
        inserted_at: null,
        removed_at: rem.event_at,
      });
    }
  }

  // Sort by earliest time descending
  sessions.sort((a, b) => {
    const tA = new Date(a.inserted_at ?? a.removed_at ?? "").getTime();
    const tB = new Date(b.inserted_at ?? b.removed_at ?? "").getTime();
    return tB - tA;
  });

  return sessions;
};

export default function CardHistory() {
  const [events, setEvents] = useState<CardEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" }); // YYYY-MM-DD
  });
  const [search, setSearch] = useState("");
  const [plateFilter, setPlateFilter] = useState("all");

  // Fetch plates for the filter
  const [plates, setPlates] = useState<string[]>([]);

  useEffect(() => {
    const fetchPlates = async () => {
      const { data } = await supabase
        .from("vehicles")
        .select("plate")
        .order("plate");
      setPlates((data || []).map((v: any) => v.plate));
    };
    fetchPlates();
  }, []);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      // Build date range in Lisbon timezone
      const dayStart = new Date(`${selectedDate}T00:00:00+00:00`);
      // Adjust for Lisbon: WET=+0, WEST=+1. Use a wide window.
      const rangeStart = new Date(dayStart.getTime() - 2 * 60 * 60 * 1000).toISOString();
      const rangeEnd = new Date(dayStart.getTime() + 26 * 60 * 60 * 1000).toISOString();

      let query = supabase
        .from("card_events")
        .select("*")
        .gte("event_at", rangeStart)
        .lte("event_at", rangeEnd)
        .order("event_at", { ascending: false });

      if (plateFilter && plateFilter !== "all") {
        query = query.eq("plate", plateFilter);
      }

      const { data, error } = await query;
      if (error) console.error("Error fetching card events:", error);
      setEvents((data as CardEvent[]) || []);
      setLoading(false);
    };
    fetchEvents();
  }, [selectedDate, plateFilter]);

  const sessions = useMemo(() => pairEvents(events), [events]);

  const filtered = useMemo(() => {
    if (!search) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(
      (s) =>
        (s.driver_name && s.driver_name.toLowerCase().includes(q)) ||
        (s.employee_number && String(s.employee_number).includes(q))
    );
  }, [sessions, search]);

  const exportData = useMemo(() => {
    return filtered.map(s => ({
      Motorista: s.driver_name || "—",
      "N. Funcionário": s.employee_number ?? "—",
      Matrícula: s.plate,
      "Hora Inserção": s.inserted_at ? new Date(s.inserted_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }) : "—",
      "Hora Retirada": s.removed_at ? new Date(s.removed_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }) : "—",
      Duração: s.inserted_at && s.removed_at ? formatDuration(s.inserted_at, s.removed_at) : s.inserted_at ? "Em curso" : "—",
    }));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Histórico de Cartões</h1>
            <p className="text-muted-foreground text-sm">Inserções e retiradas diárias de cartão de tacógrafo</p>
          </div>
        </div>
        <ExportButton data={exportData} filenameBase={`eventos-cartao-${selectedDate}`} sheetName="Eventos Cartão" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Data</label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Motorista / N.º Funcionário</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Matrícula</label>
              <Select value={plateFilter} onValueChange={setPlateFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {plates.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">A carregar...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CreditCard className="h-10 w-10 mb-2 opacity-40" />
              <p>Sem eventos para esta data</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Motorista</TableHead>
                  <TableHead>N.º Func.</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Hora Inserção</TableHead>
                  <TableHead>Hora Retirada</TableHead>
                  <TableHead>Duração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell>{s.driver_name || "—"}</TableCell>
                    <TableCell>{s.employee_number ?? "—"}</TableCell>
                    <TableCell className="font-mono">{s.plate}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.inserted_at ? formatLisbon(s.inserted_at) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.removed_at ? formatLisbon(s.removed_at) : "—"}
                    </TableCell>
                    <TableCell>
                      {s.inserted_at && s.removed_at ? (
                        <Badge variant="secondary">{formatDuration(s.inserted_at, s.removed_at)}</Badge>
                      ) : s.inserted_at ? (
                        <Badge className="bg-green-600 hover:bg-green-700">Em curso</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
