import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

export default function ServiceRequests() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    const { data } = await supabase
      .from("service_requests")
      .select("*, profiles:driver_id(full_name)")
      .order("created_at", { ascending: false });
    if (data) setRequests(data);
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, []);

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("service_requests").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(status === "approved" ? "Aprovado" : "Rejeitado");
      fetchRequests();
    }
  };

  const typeMap: Record<string, string> = { Uniform: "Fardamento", Vacation: "Férias", Document: "Documento", Other: "Outro" };
  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
    pending: { label: "Pendente", variant: "default" },
    approved: { label: "Aprovado", variant: "secondary" },
    rejected: { label: "Rejeitado", variant: "destructive" },
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header">Solicitações</h1>
        <p className="page-subtitle">Pedidos dos motoristas</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motorista</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Detalhes</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">A carregar...</TableCell></TableRow>
              ) : requests.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sem solicitações</TableCell></TableRow>
              ) : (
                requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{(r.profiles as any)?.full_name || "—"}</TableCell>
                    <TableCell>{typeMap[r.type] || r.type}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{JSON.stringify(r.details)}</TableCell>
                    <TableCell><Badge variant={statusMap[r.status]?.variant}>{statusMap[r.status]?.label}</Badge></TableCell>
                    <TableCell>
                      {r.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => updateStatus(r.id, "approved")}><Check className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => updateStatus(r.id, "rejected")}><X className="h-4 w-4" /></Button>
                        </div>
                      )}
                    </TableCell>
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
