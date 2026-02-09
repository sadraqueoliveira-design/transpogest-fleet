import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExportButton } from "@/components/admin/BulkImportExport";

export default function Drivers() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      if (!roles) { setLoading(false); return; }
      const userIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabase.from("profiles").select("*").in("id", userIds);
      if (profiles) {
        const merged = profiles.map(p => ({
          ...p,
          role: roles.find(r => r.user_id === p.id)?.role || "driver",
        }));
        setDrivers(merged);
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const roleLabels: Record<string, string> = { admin: "Administrador", manager: "Gestor", mechanic: "Mecânico", driver: "Motorista" };

  const exportData = drivers.map(d => ({
    Nome: d.full_name || "", "Carta de Condução": d.license_number || "", Função: roleLabels[d.role] || d.role,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="page-header">Motoristas & Utilizadores</h1>
          <p className="page-subtitle">Lista de utilizadores do sistema</p>
        </div>
        <ExportButton data={exportData} filenameBase="motoristas" sheetName="Motoristas" />
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Carta de Condução</TableHead>
                <TableHead>Função</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">A carregar...</TableCell></TableRow>
              ) : drivers.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nenhum utilizador encontrado</TableCell></TableRow>
              ) : (
                drivers.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.full_name || "—"}</TableCell>
                    <TableCell>{d.license_number || "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{roleLabels[d.role] || d.role}</Badge></TableCell>
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
