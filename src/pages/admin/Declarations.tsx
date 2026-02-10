import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { FileText, RefreshCw, Download, AlertTriangle, CheckCircle2, Archive } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { generateDeclarationPDF } from "@/lib/generateDeclarationPDF";

interface Declaration {
  id: string;
  driver_id: string;
  status: string;
  gap_start_date: string;
  gap_end_date: string;
  reason_code: string | null;
  reason_text: string | null;
  company_name: string;
  manager_name: string | null;
  document_url: string | null;
  created_at: string;
  driver_name?: string;
  license_number?: string;
  birth_date?: string | null;
  hire_date?: string | null;
}

const REASON_LABELS: Record<string, string> = {
  sick_leave: "Baixa por doença ou lesão",
  vacation: "Férias anuais",
  rest: "Licença ou período de repouso",
  exempt_vehicle: "Condução de veículo isento (Art.º 3)",
  other_work: "Trabalho não relacionado com condução",
  other: "Outro motivo",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Pendente", variant: "destructive" },
  signed: { label: "Assinada", variant: "default" },
  archived: { label: "Arquivada", variant: "secondary" },
};

export default function Declarations() {
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [selectedDecl, setSelectedDecl] = useState<Declaration | null>(null);
  const [reasonCode, setReasonCode] = useState("vacation");
  const [reasonText, setReasonText] = useState("");
  const [signing, setSigning] = useState(false);
  const { toast } = useToast();
  const { profile } = useAuth();

  const fetchDeclarations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("activity_declarations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Enrich with driver names
    const driverIds = [...new Set((data || []).map((d: any) => d.driver_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, license_number, birth_date, hire_date")
      .in("id", driverIds);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    const enriched = (data || []).map((d: any) => ({
      ...d,
      driver_name: profileMap.get(d.driver_id)?.full_name || "Desconhecido",
      license_number: profileMap.get(d.driver_id)?.license_number || "",
      birth_date: profileMap.get(d.driver_id)?.birth_date || null,
      hire_date: profileMap.get(d.driver_id)?.hire_date || null,
    }));

    setDeclarations(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchDeclarations();
  }, []);

  const runCheck = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-tacho-gaps");
      if (error) throw error;
      toast({
        title: "Verificação concluída",
        description: `${data?.created || 0} novas declarações criadas.`,
      });
      fetchDeclarations();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const handleSign = async () => {
    if (!selectedDecl) return;
    setSigning(true);

    const { error } = await supabase
      .from("activity_declarations")
      .update({
        status: "signed",
        reason_code: reasonCode as any,
        reason_text: reasonText || null,
        manager_name: profile?.full_name || null,
      })
      .eq("id", selectedDecl.id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      // Generate and download PDF
      try {
        const pdf = generateDeclarationPDF({
          driverName: selectedDecl.driver_name || "Desconhecido",
          licenseNumber: selectedDecl.license_number || "",
          birthDate: selectedDecl.birth_date,
          hireDate: selectedDecl.hire_date,
          gapStartDate: selectedDecl.gap_start_date,
          gapEndDate: selectedDecl.gap_end_date,
          reasonCode,
          reasonText: reasonText || undefined,
          managerName: profile?.full_name || "—",
          companyName: selectedDecl.company_name,
        });
        const driverSlug = (selectedDecl.driver_name || "motorista").replace(/\s+/g, "_");
        const dateSlug = format(new Date(selectedDecl.gap_start_date), "yyyyMMdd");
        pdf.save(`Declaracao_Atividade_${driverSlug}_${dateSlug}.pdf`);
      } catch (pdfErr) {
        console.error("PDF generation error:", pdfErr);
      }

      toast({ title: "Declaração assinada", description: "PDF gerado e descarregado." });
      setSelectedDecl(null);
      fetchDeclarations();
    }
    setSigning(false);
  };

  const handleArchive = async (id: string) => {
    const { error } = await supabase
      .from("activity_declarations")
      .update({ status: "archived" })
      .eq("id", id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Arquivada" });
      fetchDeclarations();
    }
  };

  const formatDate = (d: string) => format(new Date(d), "dd/MM/yyyy HH:mm", { locale: pt });
  const gapDays = (start: string, end: string) => {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  };

  const pendingCount = declarations.filter((d) => d.status === "draft").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Declarações de Atividade</h1>
          <p className="text-sm text-muted-foreground">Regulamento (CE) n.º 561/2006 — Gestão de lacunas de tacógrafo</p>
        </div>
        <Button onClick={runCheck} disabled={checking}>
          <RefreshCw className={`h-4 w-4 mr-2 ${checking ? "animate-spin" : ""}`} />
          Verificar Lacunas
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-2xl font-bold">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{declarations.filter((d) => d.status === "signed").length}</p>
              <p className="text-xs text-muted-foreground">Assinadas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Archive className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{declarations.filter((d) => d.status === "archived").length}</p>
              <p className="text-xs text-muted-foreground">Arquivadas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todas as Declarações</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : declarations.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma declaração encontrada. Clique "Verificar Lacunas" para detectar.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Motorista</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {declarations.map((d) => {
                    const cfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.draft;
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.driver_name}</TableCell>
                        <TableCell className="text-xs">{formatDate(d.gap_start_date)}</TableCell>
                        <TableCell className="text-xs">{formatDate(d.gap_end_date)}</TableCell>
                        <TableCell>{gapDays(d.gap_start_date, d.gap_end_date)}d</TableCell>
                        <TableCell className="text-xs">
                          {d.reason_code ? REASON_LABELS[d.reason_code] || d.reason_code : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          {d.status === "draft" && (
                            <Button size="sm" variant="outline" onClick={() => {
                              setSelectedDecl(d);
                              setReasonCode("vacation");
                              setReasonText("");
                            }}>
                              <FileText className="h-3 w-3 mr-1" /> Gerar
                            </Button>
                          )}
                          {d.status === "signed" && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => {
                                try {
                                  const pdf = generateDeclarationPDF({
                                    driverName: d.driver_name || "Desconhecido",
                                    licenseNumber: d.license_number || "",
                                    birthDate: d.birth_date,
                                    hireDate: d.hire_date,
                                    gapStartDate: d.gap_start_date,
                                    gapEndDate: d.gap_end_date,
                                    reasonCode: d.reason_code || "other",
                                    reasonText: d.reason_text || undefined,
                                    managerName: d.manager_name || "—",
                                    companyName: d.company_name,
                                  });
                                  const driverSlug = (d.driver_name || "motorista").replace(/\s+/g, "_");
                                  const dateSlug = format(new Date(d.gap_start_date), "yyyyMMdd");
                                  pdf.save(`Declaracao_Atividade_${driverSlug}_${dateSlug}.pdf`);
                                } catch (err) { console.error(err); }
                              }}>
                                <Download className="h-3 w-3 mr-1" /> PDF
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleArchive(d.id)}>
                                <Archive className="h-3 w-3 mr-1" /> Arquivar
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sign Modal */}
      <Dialog open={!!selectedDecl} onOpenChange={(o) => !o && setSelectedDecl(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Declaração de Atividade</DialogTitle>
          </DialogHeader>

          {selectedDecl && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-1 text-sm">
                <p><strong>Empresa:</strong> {selectedDecl.company_name}</p>
                <p><strong>Gestor:</strong> {profile?.full_name || "—"}</p>
                <p><strong>Motorista:</strong> {selectedDecl.driver_name}</p>
                <p><strong>N.º Carta:</strong> {selectedDecl.license_number || "N/D"}</p>
                <p><strong>Período:</strong> {formatDate(selectedDecl.gap_start_date)} — {formatDate(selectedDecl.gap_end_date)}</p>
                <p><strong>Duração:</strong> {gapDays(selectedDecl.gap_start_date, selectedDecl.gap_end_date)} dias</p>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Motivo da ausência</Label>
                <RadioGroup value={reasonCode} onValueChange={setReasonCode}>
                  {Object.entries(REASON_LABELS).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <RadioGroupItem value={k} id={k} />
                      <Label htmlFor={k} className="text-sm cursor-pointer">{v}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {reasonCode === "other" && (
                <div>
                  <Label>Observações</Label>
                  <Textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Descreva o motivo..." />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDecl(null)}>Cancelar</Button>
            <Button onClick={handleSign} disabled={signing}>
              {signing ? "A processar..." : "Assinar Declaração"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
