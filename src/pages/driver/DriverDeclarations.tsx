import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText, Clock, CheckCircle2, ShieldAlert, Zap, Download } from "lucide-react";
import { generateDeclarationPDF } from "@/lib/generateDeclarationPDF";
import { loadStampDataUrl } from "@/lib/stampUtils";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import SignaturePad from "@/components/SignaturePad";
import { uploadSignature, collectSigningMetadata, createAuditLog } from "@/lib/signatureUtils";

interface Declaration {
  id: string;
  status: string;
  gap_start_date: string;
  gap_end_date: string;
  reason_code: string | null;
  reason_text: string | null;
  company_name: string;
  created_at: string;
  manager_name?: string | null;
  driver_signature_url?: string | null;
  manager_signature_url?: string | null;
}

const REASON_LABELS: Record<string, string> = {
  sick_leave: "Baixa por doença ou lesão",
  vacation: "Férias anuais",
  rest: "Licença ou período de repouso",
  exempt_vehicle: "Condução de veículo isento (Art.º 3)",
  other_work: "Trabalho não relacionado com condução",
  other: "Disponível",
};

const LIABILITY_TEXT = "Declaro sob compromisso de honra que estive em repouso. Assumo inteira responsabilidade legal por esta informação.";

export default function DriverDeclarations() {
  const { user, profile } = useAuth();
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Declaration | null>(null);
  const [reasonCode, setReasonCode] = useState("vacation");
  const [reasonText, setReasonText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Signature flow
  const [showSignature, setShowSignature] = useState(false);
  const [pendingDecl, setPendingDecl] = useState<Declaration | null>(null);
  const [sigLoading, setSigLoading] = useState(false);
  // Liability waiver
  const [showLiability, setShowLiability] = useState(false);
  const [liabilityAccepted, setLiabilityAccepted] = useState(false);
  const [autoApproving, setAutoApproving] = useState(false);
  const [pendingAutoDecl, setPendingAutoDecl] = useState<Declaration | null>(null);
  const [pendingSigUrl, setPendingSigUrl] = useState<string | null>(null);
  const [stampDataUrl, setStampDataUrl] = useState<string | null>(null);

  // Preload stamp image
  useEffect(() => { loadStampDataUrl().then(setStampDataUrl).catch(() => {}); }, []);

  const fetchDeclarations = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("activity_declarations")
      .select("*")
      .eq("driver_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
    } else {
      setDeclarations(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDeclarations();
  }, [user]);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);

    const { error } = await supabase
      .from("activity_declarations")
      .update({
        reason_code: reasonCode as any,
        reason_text: reasonText || null,
      })
      .eq("id", selected.id);

    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }

    // After saving reason, open signature pad
    setPendingDecl(selected);
    setSelected(null);
    setShowSignature(true);
    setSubmitting(false);
  };

  const handleSignatureConfirm = async (dataUrl: string) => {
    if (!pendingDecl || !user) return;
    setSigLoading(true);

    try {
      const [signatureUrl, metadata] = await Promise.all([
        uploadSignature(dataUrl, user.id, "driver"),
        collectSigningMetadata(user.id),
      ]);

      if (!metadata.gps_lat || !metadata.gps_lng) {
        toast.error("Localização GPS obrigatória. Active a localização e tente novamente.");
        setSigLoading(false);
        return;
      }

      // Fallback: update gap_end_date to current timestamp at signing time
      const currentTimestamp = new Date().toISOString();

      const { error } = await supabase
        .from("activity_declarations")
        .update({
          driver_signature_url: signatureUrl,
          signed_ip: metadata.ip_address,
          gap_end_date: currentTimestamp,
        } as any)
        .eq("id", pendingDecl.id);

      if (error) throw error;

      // Create audit log
      const verificationId = await createAuditLog({
        declaration_id: pendingDecl.id,
        signed_by_user_id: user.id,
        signer_role: "driver",
        signer_name: profile?.full_name || user.email || "Motorista",
        signed_at: metadata.signed_at,
        gps_lat: metadata.gps_lat,
        gps_lng: metadata.gps_lng,
        device_info: metadata.device_info,
        ip_address: metadata.ip_address,
        signature_url: signatureUrl,
      });

      // Now attempt auto-approval
      try {
        const { data: autoResult, error: autoError } = await supabase.functions.invoke(
          "auto-approve-declaration",
          {
            body: {
              declaration_id: pendingDecl.id,
              reason_code: reasonCode,
              reason_text: reasonText || null,
              driver_signature_url: signatureUrl,
              gps_lat: metadata.gps_lat,
              gps_lng: metadata.gps_lng,
              device_info: metadata.device_info,
              ip_address: metadata.ip_address,
              liability_accepted: true, // We'll show waiver first if needed
            },
          }
        );

        if (!autoError && autoResult?.auto_approved === false && autoResult?.reason !== "manager_online") {
          // No rule found or no signature - show waiver anyway for future
          toast.success(`Declaração assinada! ID: ${verificationId}. Aguarda aprovação do gestor.`);
        } else if (!autoError && autoResult?.auto_approved === false && autoResult?.reason === "manager_online") {
          toast.success(`Declaração assinada! ID: ${verificationId}. Gestor notificado.`);
        } else if (!autoError && autoResult?.auto_approved) {
          // Auto-approved but we need to check if liability was shown
          // Actually, we need to present the waiver BEFORE auto-approving
          // Let's show the liability dialog
          setPendingSigUrl(signatureUrl);
          setPendingAutoDecl(pendingDecl);
          setShowSignature(false);
          setPendingDecl(null);
          setShowLiability(true);
          setSigLoading(false);
          return;
        } else {
          toast.success(`Declaração assinada! ID: ${verificationId}. Aguarda aprovação do gestor.`);
        }
      } catch {
        // Auto-approval check failed, continue with standard flow
        toast.success(`Declaração assinada! ID: ${verificationId}. Aguarda aprovação do gestor.`);
      }

      setShowSignature(false);
      setPendingDecl(null);
      fetchDeclarations();
    } catch (err: any) {
      toast.error("Erro ao assinar: " + err.message);
    } finally {
      setSigLoading(false);
    }
  };

  const handleLiabilityConfirm = async () => {
    if (!pendingAutoDecl || !user || !pendingSigUrl) return;
    setAutoApproving(true);

    try {
      const metadata = await collectSigningMetadata(user.id);

      const { data: result, error } = await supabase.functions.invoke(
        "auto-approve-declaration",
        {
          body: {
            declaration_id: pendingAutoDecl.id,
            reason_code: reasonCode,
            reason_text: reasonText || null,
            driver_signature_url: pendingSigUrl,
            gps_lat: metadata.gps_lat,
            gps_lng: metadata.gps_lng,
            device_info: metadata.device_info,
            ip_address: metadata.ip_address,
            liability_accepted: true,
          },
        }
      );

      if (error) throw error;

      if (result?.auto_approved) {
        toast.success(`Declaração auto-aprovada! ID: ${result.verification_id}`);
      } else {
        toast.info(result?.message || "Aguarda aprovação do gestor.");
      }

      setShowLiability(false);
      setPendingAutoDecl(null);
      setPendingSigUrl(null);
      setLiabilityAccepted(false);
      fetchDeclarations();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setAutoApproving(false);
    }
  };

  const formatDate = (d: string) => format(new Date(d), "dd/MM/yyyy HH:mm", { locale: pt });
  const gapHours = (start: string, end: string) => {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return Math.round(ms / (1000 * 60 * 60));
  };

  const pendingDeclarations = declarations.filter((d) => d.status === "draft");
  const otherDeclarations = declarations.filter((d) => d.status !== "draft");

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold">Declarações de Atividade</h1>
        <p className="text-sm text-muted-foreground">Justifique as suas ausências de tacógrafo</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : declarations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-primary mb-2" />
            <p className="text-muted-foreground">Sem declarações pendentes. Tudo em ordem!</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {pendingDeclarations.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-destructive flex items-center gap-1">
                <Clock className="h-4 w-4" /> Pendentes ({pendingDeclarations.length})
              </h2>
              {pendingDeclarations.map((d) => (
                <Card key={d.id} className="border-destructive/30">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="destructive">Pendente</Badge>
                      <span className="text-xs text-muted-foreground">{gapHours(d.gap_start_date, d.gap_end_date)}h sem cartão</span>
                    </div>
                    <div className="text-sm space-y-1">
                      <p><span className="text-muted-foreground">De:</span> {formatDate(d.gap_start_date)}</p>
                      <p><span className="text-muted-foreground">Até:</span> {formatDate(d.gap_end_date)}</p>
                    </div>
                    <Button
                      className="w-full mt-2"
                      size="lg"
                      onClick={() => {
                        setSelected(d);
                        setReasonCode(d.reason_code || "vacation");
                        setReasonText(d.reason_text || "");
                      }}
                    >
                      <FileText className="h-4 w-4 mr-2" /> Justificar e Assinar
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {otherDeclarations.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Anteriores</h2>
              {otherDeclarations.map((d) => (
                <Card key={d.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={d.status === "signed" ? "default" : "secondary"}>
                          {d.status === "signed" ? "Assinada" : "Arquivada"}
                        </Badge>
                        {d.manager_name?.includes("(Auto)") && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Zap className="h-3 w-3" /> Auto
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDate(d.created_at)}</span>
                    </div>
                    <div className="text-sm mt-2 space-y-1">
                      <p><span className="text-muted-foreground">Período:</span> {formatDate(d.gap_start_date)} — {formatDate(d.gap_end_date)}</p>
                      {d.reason_code && (
                        <p><span className="text-muted-foreground">Motivo:</span> {REASON_LABELS[d.reason_code] || d.reason_code}</p>
                      )}
                    </div>
                    {d.status === "signed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-3"
                        onClick={async () => {
                          try {
                            const fetchImg = async (url: string): Promise<string | undefined> => {
                              try {
                                const storageMatch = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/);
                                let blob: Blob;
                                if (storageMatch) {
                                  const [, bucket, path] = storageMatch;
                                  const { data, error } = await supabase.storage.from(bucket).download(decodeURIComponent(path));
                                  if (error || !data) throw error || new Error("Download failed");
                                  blob = data;
                                } else {
                                  const res = await fetch(url);
                                  blob = await res.blob();
                                }
                                return await new Promise<string>((resolve) => {
                                  const reader = new FileReader();
                                  reader.onloadend = () => resolve(reader.result as string);
                                  reader.readAsDataURL(blob);
                                });
                              } catch { return undefined; }
                            };
                            const [driverSig, managerSig] = await Promise.all([
                              d.driver_signature_url ? fetchImg(d.driver_signature_url) : Promise.resolve(undefined),
                              d.manager_signature_url ? fetchImg(d.manager_signature_url) : Promise.resolve(undefined),
                            ]);
                            const pdf = generateDeclarationPDF({
                              driverName: profile?.full_name || "Motorista",
                              licenseNumber: profile?.license_number || "",
                              birthDate: null,
                              hireDate: null,
                              gapStartDate: d.gap_start_date,
                              gapEndDate: d.gap_end_date,
                              reasonCode: d.reason_code || "other",
                              reasonText: d.reason_text || undefined,
                              managerName: (d.manager_name || "—").replace(/\s*\(Auto\)\s*$/i, "").trim() || "—",
                              companyName: d.company_name,
                              driverSignatureDataUrl: driverSig,
                              managerSignatureDataUrl: managerSig,
                              _stampDataUrl: stampDataUrl || undefined,
                            });
                            const dateSlug = format(new Date(d.gap_start_date), "yyyyMMdd");
                            pdf.save(`Declaracao_${dateSlug}.pdf`);
                          } catch (err) { console.error(err); }
                        }}
                      >
                        <Download className="h-4 w-4 mr-2" /> Download PDF
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Justification modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Justificar Ausência</DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <p><strong>De:</strong> {formatDate(selected.gap_start_date)}</p>
                <p><strong>Até:</strong> {formatDate(selected.gap_end_date)}</p>
                <p><strong>Duração:</strong> {gapHours(selected.gap_start_date, selected.gap_end_date)} horas</p>
              </div>

              <div className="space-y-3">
                <Label className="font-semibold">Qual foi o motivo?</Label>
                <RadioGroup value={reasonCode} onValueChange={setReasonCode}>
                  {Object.entries(REASON_LABELS).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <RadioGroupItem value={k} id={`driver-${k}`} />
                      <Label htmlFor={`driver-${k}`} className="text-sm cursor-pointer">{v}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {reasonCode === "other" && (
                <div>
                  <Label>Observações</Label>
                  <Textarea
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    placeholder="Descreva o motivo..."
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={submitting} size="lg">
              {submitting ? "A enviar..." : "Seguinte — Assinar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature modal */}
      <SignaturePad
        open={showSignature}
        onOpenChange={(o) => { if (!o) { setShowSignature(false); setPendingDecl(null); } }}
        title="Assinar Declaração"
        subtitle="Confirme com a sua assinatura digital"
        summaryContent={pendingDecl && (
          <>
            <p><strong>De:</strong> {formatDate(pendingDecl.gap_start_date)}</p>
            <p><strong>Até:</strong> {formatDate(pendingDecl.gap_end_date)}</p>
            <p><strong>Motivo:</strong> {REASON_LABELS[reasonCode] || reasonCode}</p>
          </>
        )}
        onConfirm={handleSignatureConfirm}
        loading={sigLoading}
      />

      {/* Liability Waiver Dialog */}
      <Dialog open={showLiability} onOpenChange={(o) => {
        if (!o) {
          setShowLiability(false);
          setPendingAutoDecl(null);
          setPendingSigUrl(null);
          setLiabilityAccepted(false);
          fetchDeclarations();
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Declaração de Responsabilidade
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium">
                Nenhum gestor está disponível neste momento. A sua declaração pode ser aprovada automaticamente.
              </p>
            </div>

            <div className="rounded-lg border p-3 text-sm space-y-1 bg-muted/50">
              <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-2">Compromisso de Honra</p>
              <p className="text-sm italic">{LIABILITY_TEXT}</p>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="liability"
                checked={liabilityAccepted}
                onCheckedChange={(c) => setLiabilityAccepted(c === true)}
                className="mt-0.5"
              />
              <Label htmlFor="liability" className="text-sm cursor-pointer leading-relaxed">
                Li e aceito a declaração acima. Assumo inteira responsabilidade.
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setShowLiability(false);
              setPendingAutoDecl(null);
              setPendingSigUrl(null);
              setLiabilityAccepted(false);
              fetchDeclarations();
            }}>
              Cancelar
            </Button>
            <Button
              onClick={handleLiabilityConfirm}
              disabled={!liabilityAccepted || autoApproving}
              size="lg"
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              {autoApproving ? "A processar..." : "Confirmar Auto-Aprovação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
