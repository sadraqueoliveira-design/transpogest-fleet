import { useState } from "react";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Database, Users, HardDrive, KeyRound, Zap, Code2, ScrollText, BarChart3, Download, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

type ExportSection = "database" | "users" | "storage" | "secrets" | "edge_functions" | "sql" | "logs" | "usage";

interface SectionDef {
  key: ExportSection;
  label: string;
  icon: any;
  description: string;
  tables?: string[];
}

const sections: SectionDef[] = [
  {
    key: "database",
    label: "Database",
    icon: Database,
    description: "Exportar todas as tabelas principais do sistema.",
    tables: [
      "vehicles", "trailers", "clients", "hubs", "routes",
      "maintenance_records", "vehicle_maintenance_schedule", "vehicle_documents",
      "dynamic_forms", "checklist_submissions", "occurrences",
      "fuel_logs", "fuel_alerts", "refueling_events",
      "driver_activities", "card_events",
      "tachograph_cards", "employees",
      "activity_declarations", "signature_audit_logs",
      "compliance_rules", "compliance_violations",
      "approval_rules", "driver_groups", "driver_group_members",
      "antram_settings", "app_config",
    ],
  },
  {
    key: "users",
    label: "Users",
    icon: Users,
    description: "Exportar perfis de utilizadores e papéis.",
    tables: ["profiles", "user_roles"],
  },
  {
    key: "storage",
    label: "Storage",
    icon: HardDrive,
    description: "Listar buckets e ficheiros armazenados.",
  },
  {
    key: "secrets",
    label: "Secrets",
    icon: KeyRound,
    description: "Informação sobre segredos configurados (sem valores).",
  },
  {
    key: "edge_functions",
    label: "Edge Functions",
    icon: Zap,
    description: "Listar funções de backend disponíveis.",
  },
  {
    key: "sql",
    label: "SQL",
    icon: Code2,
    description: "Exportar estrutura SQL das tabelas.",
  },
  {
    key: "logs",
    label: "Logs",
    icon: ScrollText,
    description: "Exportar logs de notificações push.",
    tables: ["push_notifications_log"],
  },
  {
    key: "usage",
    label: "Usage",
    icon: BarChart3,
    description: "Exportar dados de utilização (tokens FCM, solicitações).",
    tables: ["user_fcm_tokens", "service_requests"],
  },
];

function arrayToCSV(data: Record<string, any>[]): string {
  if (!data.length) return "";
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      const v = row[h];
      const str = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(";")
  );
  return [headers.join(";"), ...rows].join("\n");
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataExport() {
  const [active, setActive] = useState<ExportSection>("database");
  const [loading, setLoading] = useState<string | null>(null);

  const current = sections.find(s => s.key === active)!;

  const exportTable = async (table: string) => {
    setLoading(table);
    try {
      const { data, error } = await supabase.from(table as any).select("*").limit(10000);
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.info(`Tabela "${table}" está vazia.`);
        setLoading(null);
        return;
      }
      const csv = arrayToCSV(data as Record<string, any>[]);
      downloadCSV(csv, `${table}_export.csv`);
      toast.success(`${data.length} registos exportados de "${table}".`);
    } catch (err: any) {
      toast.error(`Erro ao exportar "${table}": ${err.message}`);
    }
    setLoading(null);
  };

  const exportAllTables = async () => {
    if (!current.tables) return;
    setLoading("all");
    for (const table of current.tables) {
      await exportTable(table);
    }
    setLoading(null);
  };

  const handleStorageExport = async () => {
    setLoading("storage");
    try {
      const { data, error } = await supabase.storage.listBuckets();
      if (error) throw error;
      const rows = (data || []).map(b => ({
        id: b.id,
        name: b.name,
        public: b.public,
        created_at: b.created_at,
      }));
      if (!rows.length) { toast.info("Sem buckets."); setLoading(null); return; }
      downloadCSV(arrayToCSV(rows), "storage_buckets.csv");
      toast.success(`${rows.length} buckets exportados.`);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
    setLoading(null);
  };

  const handleEdgeFunctionsExport = () => {
    const fns = [
      "auto-approve-declaration", "check-document-expiry", "check-driving-limits",
      "check-fuel-alerts", "check-maintenance-alerts", "check-tacho-gaps",
      "create-admin", "create-driver", "get-vapid-key", "list-user-emails",
      "map-tacho-cards", "morning-digest", "notify-missing-card", "send-fcm",
      "send-push", "sync-trackit-data", "test-trackit-connection",
      "trackit-events", "update-driver-credentials",
    ];
    const rows = fns.map(f => ({ name: f, status: "deployed" }));
    downloadCSV(arrayToCSV(rows), "edge_functions.csv");
    toast.success(`${fns.length} funções listadas.`);
  };

  const handleSecretsExport = () => {
    toast.info("Por segurança, os valores dos segredos não podem ser exportados. Consulte as configurações do projeto.");
  };

  const [sqlSchema, setSqlSchema] = useState<string>("");
  const [sqlLoading, setSqlLoading] = useState(false);

  const handleSQLExport = async () => {
    setSqlLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_user_role" as any, { _user_id: "" }).throwOnError();
    } catch {}

    // Build SQL from known schema
    const allTables = [
      ...sections.find(s => s.key === "database")!.tables!,
      ...sections.find(s => s.key === "users")!.tables!,
      ...sections.find(s => s.key === "logs")!.tables!,
      ...sections.find(s => s.key === "usage")!.tables!,
    ];

    let sql = "-- Schema export generated at " + new Date().toISOString() + "\n\n";

    for (const table of allTables) {
      try {
        const { data, error } = await supabase.from(table as any).select("*").limit(1);
        if (data && data.length > 0) {
          const cols = Object.keys(data[0]);
          sql += `-- Table: ${table}\n`;
          sql += `CREATE TABLE IF NOT EXISTS public.${table} (\n`;
          sql += cols.map(c => {
            const val = (data[0] as any)[c];
            let type = "text";
            if (typeof val === "number") type = Number.isInteger(val) ? "integer" : "double precision";
            else if (typeof val === "boolean") type = "boolean";
            else if (val && typeof val === "object") type = "jsonb";
            else if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) type = "timestamp with time zone";
            return `  ${c} ${type}`;
          }).join(",\n");
          sql += "\n);\n\n";
        } else {
          sql += `-- Table: ${table} (empty or no access)\n\n`;
        }
      } catch {
        sql += `-- Table: ${table} (error reading)\n\n`;
      }
    }

    setSqlSchema(sql);
    setSqlLoading(false);
    toast.success("Schema SQL gerado com sucesso.");
  };

  const copySQL = () => {
    navigator.clipboard.writeText(sqlSchema);
    toast.success("SQL copiado para a área de transferência.");
  };

  const downloadSQL = () => {
    const blob = new Blob([sqlSchema], { type: "text/sql;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "schema_export.sql";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex gap-6 min-h-[calc(100vh-8rem)]">
      {/* Sidebar */}
      <div className="w-56 shrink-0 space-y-1">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-2">Exportação de Dados</h2>
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active === s.key
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <s.icon className="h-4 w-4 shrink-0" />
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <current.icon className="h-6 w-6 text-primary" />
            {current.label}
          </h1>
          <p className="text-muted-foreground mt-1">{current.description}</p>
        </div>

        {/* Database / Users / Logs / Usage — table-based export */}
        {current.tables && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Button onClick={exportAllTables} disabled={loading === "all"} className="gap-2">
                {loading === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Exportar Tudo ({current.tables.length} tabelas)
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {current.tables.map(table => (
                <Card key={table} className="flex flex-col justify-between">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono">{table}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 w-full"
                      disabled={loading === table}
                      onClick={() => exportTable(table)}
                    >
                      {loading === table ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                      CSV
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {active === "storage" && (
          <Card>
            <CardHeader>
              <CardTitle>Buckets de Armazenamento</CardTitle>
              <CardDescription>Exporta a lista de buckets configurados.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleStorageExport} disabled={loading === "storage"} className="gap-2">
                {loading === "storage" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Exportar Buckets
              </Button>
            </CardContent>
          </Card>
        )}

        {active === "secrets" && (
          <Card>
            <CardHeader>
              <CardTitle>Segredos</CardTitle>
              <CardDescription>Os valores dos segredos não podem ser exportados por razões de segurança.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" onClick={handleSecretsExport} className="gap-2">
                <KeyRound className="h-4 w-4" /> Ver Informação
              </Button>
            </CardContent>
          </Card>
        )}

        {active === "edge_functions" && (
          <Card>
            <CardHeader>
              <CardTitle>Funções de Backend</CardTitle>
              <CardDescription>Lista todas as funções implantadas no projeto.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleEdgeFunctionsExport} className="gap-2">
                <Download className="h-4 w-4" /> Exportar Lista
              </Button>
            </CardContent>
          </Card>
        )}

        {active === "sql" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Estrutura SQL</CardTitle>
                <CardDescription>Gere o schema SQL de todas as tabelas e copie ou exporte.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button onClick={handleSQLExport} disabled={sqlLoading} className="gap-2">
                    {sqlLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Code2 className="h-4 w-4" />}
                    Gerar Schema SQL
                  </Button>
                  {sqlSchema && (
                    <>
                      <Button variant="outline" onClick={copySQL} className="gap-2">
                        <Copy className="h-4 w-4" /> Copiar
                      </Button>
                      <Button variant="outline" onClick={downloadSQL} className="gap-2">
                        <Download className="h-4 w-4" /> Exportar .sql
                      </Button>
                    </>
                  )}
                </div>
                {sqlSchema && (
                  <textarea
                    readOnly
                    value={sqlSchema}
                    className="w-full min-h-[400px] rounded-md border border-input bg-muted/50 px-3 py-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
