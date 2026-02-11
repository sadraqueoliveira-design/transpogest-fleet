import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, RefreshCw, Shield, Search, Calendar, Download, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import ComplianceViolationsPanel from "@/components/admin/ComplianceViolationsPanel";

interface Violation {
  id: string;
  driver_id: string;
  violation_type: string;
  severity: string;
  details: any;
  detected_at: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

interface DriverProfile {
  id: string;
  full_name: string | null;
}

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

const violationLabels: Record<string, string> = {
  continuous_limit_exceeded: "Condução Contínua Excedida",
  daily_limit_exceeded: "Limite Diário Excedido",
  weekly_limit_exceeded: "Limite Semanal Excedido (56h)",
  biweekly_limit_exceeded: "Limite Bi-Semanal Excedido (90h)",
};

const severityColors: Record<string, string> = {
  critical: "destructive",
  warning: "outline",
};

export default function Compliance() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [driverFilter, setDriverFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    setLoading(true);
    let query = supabase
      .from("compliance_violations")
      .select("*")
      .gte("detected_at", `${dateFrom}T00:00:00`)
      .lte("detected_at", `${dateTo}T23:59:59`)
      .order("detected_at", { ascending: false })
      .limit(500);

    if (driverFilter !== "all") query = query.eq("driver_id", driverFilter);
    if (typeFilter !== "all") query = query.eq("violation_type", typeFilter);

    const [{ data: vData }, { data: driverRoles }] = await Promise.all([
      query,
      supabase.from("user_roles").select("user_id").eq("role", "driver"),
    ]);

    if (driverRoles) {
      const ids = driverRoles.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      setDrivers(profiles || []);
    }

    setViolations(vData || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [dateFrom, dateTo, driverFilter, typeFilter]);

  const driverName = (id: string) => drivers.find(d => d.id === id)?.full_name || id.slice(0, 8);

  const handleAck = async (id: string) => {
    const { error } = await supabase
      .from("compliance_violations")
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Violação reconhecida");
      fetchData();
    }
  };

  const filtered = violations.filter(v => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = driverName(v.driver_id).toLowerCase();
    const type = (violationLabels[v.violation_type] || v.violation_type).toLowerCase();
    return name.includes(q) || type.includes(q);
  });

  const stats = {
    total: filtered.length,
    critical: filtered.filter(v => v.severity === "critical").length,
    unack: filtered.filter(v => !v.acknowledged).length,
    drivers: new Set(filtered.map(v => v.driver_id)).size,
  };

  const exportRows = () =>
    filtered.map(v => ({
      "Data/Hora": new Date(v.detected_at).toLocaleString("pt-PT"),
      Motorista: driverName(v.driver_id),
      Tipo: violationLabels[v.violation_type] || v.violation_type,
      Severidade: v.severity,
      "Minutos": v.details?.minutes ?? "",
      "Limite": v.details?.limit ?? "",
      Estado: v.acknowledged ? "Reconhecida" : "Pendente",
    }));

  const exportCSV = () => {
    const rows = exportRows();
    if (!rows.length) return toast.error("Sem dados para exportar");
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(";"), ...rows.map(r => headers.map(h => `"${r[h as keyof typeof r] ?? ""}"`).join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `violacoes_compliance_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  const exportExcel = () => {
    const rows = exportRows();
    if (!rows.length) return toast.error("Sem dados para exportar");
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Violações");
    XLSX.writeFile(wb, `violacoes_compliance_${dateFrom}_${dateTo}.xlsx`);
    toast.success("Excel exportado");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header">Compliance EU 561/2006</h1>
        <p className="page-subtitle">Monitorização de violações e risco de multa</p>
      </div>

      {/* Live risk panel */}
      <ComplianceViolationsPanel />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Violações</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Shield className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-2xl font-bold">{stats.critical}</p>
              <p className="text-xs text-muted-foreground">Críticas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <div>
              <p className="text-2xl font-bold">{stats.unack}</p>
              <p className="text-xs text-muted-foreground">Não Reconhecidas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{stats.drivers}</p>
              <p className="text-xs text-muted-foreground">Motoristas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico de Violações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Pesquisar motorista ou tipo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={driverFilter} onValueChange={setDriverFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Motorista" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os motoristas</SelectItem>
                {drivers.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.full_name || d.id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {Object.entries(violationLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
              <span className="text-xs text-muted-foreground">a</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
            </div>
            <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
          </div>

          {/* Table */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Detalhes</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      A carregar...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <Shield className="h-8 w-8 mx-auto mb-2 text-success" />
                      Sem violações no período selecionado
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(v => (
                    <TableRow key={v.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(v.detected_at).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{driverName(v.driver_id)}</TableCell>
                      <TableCell className="text-sm">{violationLabels[v.violation_type] || v.violation_type}</TableCell>
                      <TableCell>
                        <Badge variant={v.severity === "critical" ? "destructive" : "outline"} className="text-[10px]">
                          {v.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {v.details?.minutes ? `${formatMinutes(v.details.minutes)} / ${formatMinutes(v.details.limit)}` : "—"}
                      </TableCell>
                      <TableCell>
                        {v.acknowledged ? (
                          <Badge variant="outline" className="text-[10px] text-success border-success">Reconhecida</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {!v.acknowledged && (
                          <Button variant="ghost" size="sm" onClick={() => handleAck(v.id)} className="text-xs">
                            Reconhecer
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
