import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Search } from "lucide-react";
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

const formatLisbon = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

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

  const filtered = useMemo(() => {
    if (!search) return events;
    const q = search.toLowerCase();
    return events.filter(
      (e) =>
        (e.driver_name && e.driver_name.toLowerCase().includes(q)) ||
        (e.employee_number && String(e.employee_number).includes(q))
    );
  }, [events, search]);

  const exportData = useMemo(() => {
    return filtered.map(ev => ({
      Hora: new Date(ev.event_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }),
      Evento: ev.event_type === "inserted" ? "Inserido" : "Retirado",
      Motorista: ev.driver_name || "—",
      "N. Funcionário": ev.employee_number ?? "—",
      Matrícula: ev.plate,
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
                  <TableHead>Hora</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Motorista</TableHead>
                  <TableHead>N.º Func.</TableHead>
                  <TableHead>Matrícula</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell className="font-mono text-sm">
                      {formatLisbon(ev.event_at)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={ev.event_type === "inserted" ? "default" : "destructive"}
                        className={ev.event_type === "inserted" ? "bg-green-600 hover:bg-green-700" : ""}
                      >
                        {ev.event_type === "inserted" ? "Inserido" : "Retirado"}
                      </Badge>
                    </TableCell>
                    <TableCell>{ev.driver_name || "—"}</TableCell>
                    <TableCell>{ev.employee_number ?? "—"}</TableCell>
                    <TableCell className="font-mono">{ev.plate}</TableCell>
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
