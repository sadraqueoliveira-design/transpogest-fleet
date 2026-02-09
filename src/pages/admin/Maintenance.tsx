import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ImportButton, ExportButton } from "@/components/admin/BulkImportExport";

const ALIASES: Record<string, string[]> = {
  plate: ["plate", "matrícula", "matricula", "veículo", "veiculo"],
  type: ["type", "tipo"],
  description: ["description", "descrição", "descricao"],
  cost: ["cost", "custo", "valor"],
  status: ["status", "estado"],
  date_scheduled: ["date_scheduled", "data", "data agendada"],
};

export default function Maintenance() {
  const [records, setRecords] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [{ data: mData }, { data: vData }] = await Promise.all([
      supabase.from("maintenance_records").select("*, vehicles(plate)").order("created_at", { ascending: false }),
      supabase.from("vehicles").select("id, plate"),
    ]);
    if (mData) setRecords(mData);
    if (vData) {
      const map: Record<string, string> = {};
      vData.forEach(v => { map[v.plate.replace(/[\s-]/g, "").toUpperCase()] = v.id; });
      setVehicles(map);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
    pending: { label: "Pendente", variant: "destructive" },
    in_progress: { label: "Em Curso", variant: "default" },
    completed: { label: "Concluído", variant: "secondary" },
  };

  const exportData = records.map(r => ({
    Veículo: r.vehicles?.plate || "", Tipo: r.type === "preventive" ? "Preventiva" : "Corretiva",
    Descrição: r.description || "", Custo: r.cost ?? "", Estado: statusMap[r.status]?.label || r.status,
  }));

  const handleImport = async (rows: Record<string, string>[]) => {
    const payload = rows.map(r => {
      const normalizedPlate = (r.plate || "").replace(/[\s-]/g, "").toUpperCase();
      return {
        vehicle_id: vehicles[normalizedPlate] || "",
        type: (r.type?.toLowerCase().includes("preventiv") ? "preventive" : "corrective") as "preventive" | "corrective",
        description: r.description || null,
        cost: r.cost ? parseFloat(r.cost) : null,
        status: (r.status?.toLowerCase().includes("conclu") ? "completed" : r.status?.toLowerCase().includes("curso") ? "in_progress" : "pending") as any,
        date_scheduled: r.date_scheduled || null,
      };
    }).filter(p => p.vehicle_id);

    if (payload.length === 0) { toast.error("Nenhuma matrícula corresponde a veículos existentes"); return; }
    const { error } = await supabase.from("maintenance_records").insert(payload);
    if (error) throw error;
    toast.success(`${payload.length} registo(s) importado(s)`);
    fetchData();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="page-header">Manutenção</h1>
          <p className="page-subtitle">Registos de manutenção da frota</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton
            columns={["plate", "type", "description", "cost", "status", "date_scheduled"]}
            aliases={ALIASES}
            requiredColumns={["plate", "type"]}
            validate={(r) => ({ valid: !!r.plate && !!r.type, error: !r.plate ? "Matrícula em falta" : !r.type ? "Tipo em falta" : undefined })}
            onImport={handleImport}
            templateHeader="matrícula;tipo;descrição;custo;estado;data agendada"
            templateExample="12-AB-34;Preventiva;Troca de óleo;150;Pendente;2026-03-15"
            templateFilename="modelo_manutencao.csv"
          />
          <ExportButton data={exportData} filenameBase="manutencao" sheetName="Manutenção" />
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Veículo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Custo</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">A carregar...</TableCell></TableRow>
              ) : records.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sem registos de manutenção</TableCell></TableRow>
              ) : (
                records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{r.vehicles?.plate || "—"}</TableCell>
                    <TableCell className="capitalize">{r.type === "preventive" ? "Preventiva" : "Corretiva"}</TableCell>
                    <TableCell>{r.description || "—"}</TableCell>
                    <TableCell>{r.cost ? `€${Number(r.cost).toFixed(2)}` : "—"}</TableCell>
                    <TableCell><Badge variant={statusMap[r.status]?.variant}>{statusMap[r.status]?.label}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
