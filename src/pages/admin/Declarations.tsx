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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { FileText, RefreshCw, Download, AlertTriangle, CheckCircle2, Archive, ChevronDown, Pencil } from "lucide-react";
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
  other: "Disponível",
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
  const [editFields, setEditFields] = useState({
    companyAddress: "Rua, Vale Casal, 42, Edf. Florêncio e Silva. Vale Casal, 2665-379 Milharado, Portugal",
    companyPhone: "+351 219667000",
    companyFax: "+351 219667009",
    companyEmail: "florencio.silva@tfs.pt",
    managerPosition: "Responsável de Tráfego",
    signingLocation: "Alverca",
  });
  const [driverFields, setDriverFields] = useState({
    driverName: "",
    licenseNumber: "",
    birthDate: "",
    hireDate: "",
    gapStartDate: "",
    gapEndDate: "",
  });
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
          driverName: driverFields.driverName || "Desconhecido",
          licenseNumber: driverFields.licenseNumber || "",
          birthDate: driverFields.birthDate || null,
          hireDate: driverFields.hireDate || null,
          gapStartDate: driverFields.gapStartDate || selectedDecl.gap_start_date,
          gapEndDate: driverFields.gapEndDate || selectedDecl.gap_end_date,
          reasonCode,
          reasonText: reasonText || undefined,
          managerName: profile?.full_name || "—",
          companyName: selectedDecl.company_name,
          ...editFields,
        });
        const driverSlug = (driverFields.driverName || "motorista").replace(/\s+/g, "_");
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
                              setDriverFields({
                                driverName: d.driver_name || "",
                                licenseNumber: d.license_number || "",
                                birthDate: d.birth_date || "",
                                hireDate: d.hire_date || "",
                                gapStartDate: d.gap_start_date ? d.gap_start_date.slice(0, 16) : "",
                                gapEndDate: d.gap_end_date ? d.gap_end_date.slice(0, 16) : "",
                              });
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
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Início do período (9)</Label>
                  <Input type="datetime-local" value={driverFields.gapStartDate} onChange={(e) => setDriverFields(f => ({ ...f, gapStartDate: e.target.value }))} className="text-xs" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Fim do período (10)</Label>
                  <Input type="datetime-local" value={driverFields.gapEndDate} onChange={(e) => setDriverFields(f => ({ ...f, gapEndDate: e.target.value }))} className="text-xs" />
                </div>
              </div>

              <Collapsible defaultOpen>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Pencil className="h-3 w-3" /> Dados do motorista</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <div>
                    <Label className="text-xs">Nome do motorista</Label>
                    <Input value={driverFields.driverName} onChange={(e) => setDriverFields(f => ({ ...f, driverName: e.target.value }))} className="text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">N.º Carta de Condução / BI / Passaporte</Label>
                    <Input value={driverFields.licenseNumber} onChange={(e) => setDriverFields(f => ({ ...f, licenseNumber: e.target.value }))} className="text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Data de nascimento</Label>
                      <Input type="date" value={driverFields.birthDate} onChange={(e) => setDriverFields(f => ({ ...f, birthDate: e.target.value }))} className="text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Data de contratação</Label>
                      <Input type="date" value={driverFields.hireDate} onChange={(e) => setDriverFields(f => ({ ...f, hireDate: e.target.value }))} className="text-xs" />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

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

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Pencil className="h-3 w-3" /> Editar dados da empresa</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <div>
                    <Label className="text-xs">Morada</Label>
                    <Input value={editFields.companyAddress} onChange={(e) => setEditFields(f => ({ ...f, companyAddress: e.target.value }))} className="text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Telefone</Label>
                      <Input value={editFields.companyPhone} onChange={(e) => setEditFields(f => ({ ...f, companyPhone: e.target.value }))} className="text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Fax</Label>
                      <Input value={editFields.companyFax} onChange={(e) => setEditFields(f => ({ ...f, companyFax: e.target.value }))} className="text-xs" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input value={editFields.companyEmail} onChange={(e) => setEditFields(f => ({ ...f, companyEmail: e.target.value }))} className="text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Cargo do gestor</Label>
                      <Input value={editFields.managerPosition} onChange={(e) => setEditFields(f => ({ ...f, managerPosition: e.target.value }))} className="text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Localidade (assinatura)</Label>
                      <Input value={editFields.signingLocation} onChange={(e) => setEditFields(f => ({ ...f, signingLocation: e.target.value }))} className="text-xs" />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
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
