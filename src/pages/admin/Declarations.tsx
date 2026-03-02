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
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, RefreshCw, Download, AlertTriangle, CheckCircle2, Archive, ChevronDown, Pencil, PenTool, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { generateDeclarationPDF } from "@/lib/generateDeclarationPDF";
import { loadStampDataUrl } from "@/lib/stampUtils";
import SignaturePad from "@/components/SignaturePad";
import { uploadSignature, uploadSignedPDF, collectSigningMetadata, createAuditLog } from "@/lib/signatureUtils";
import { fetchManagerSignatureForPDF } from "@/lib/managerSignature";

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
  driver_signature_url?: string | null;
  manager_signature_url?: string | null;
  signed_pdf_url?: string | null;
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
  const { profile, user } = useAuth();

  // Manager signature states
  const [showManagerSig, setShowManagerSig] = useState(false);
  const [managerSigLoading, setManagerSigLoading] = useState(false);
  const [savedManagerSig, setSavedManagerSig] = useState<string | null>(null);
  const [showSaveSignature, setShowSaveSignature] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [stampDataUrl, setStampDataUrl] = useState<string | null>(null);

  // Preload stamp image
  useEffect(() => { loadStampDataUrl().then(setStampDataUrl).catch(() => {}); }, []);

  // Load saved manager signature (from private manager-signatures bucket)
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("saved_signature_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        const path = (data as any)?.saved_signature_url;
        if (path) {
          // Try to get a signed URL from private bucket
          const { data: signed } = await supabase.storage
            .from("manager-signatures")
            .createSignedUrl(path, 60 * 60);
          if (signed?.signedUrl) {
            setSavedManagerSig(signed.signedUrl);
          } else {
            // Fallback: maybe it's an old public URL
            setSavedManagerSig(path);
          }
        }
      });
  }, [user]);

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

  /** Generate PDF with signatures, audit trail and upload */
  const generateAndUploadPDF = async (
    decl: Declaration,
    managerSignatureDataUrl: string,
    managerName: string,
    verificationId?: string
  ) => {
    const metadata = await collectSigningMetadata(user!.id);
    const signedAt = format(new Date(), "dd/MM/yyyy HH:mm:ss", { locale: pt });

    // Fetch driver signature data URL if available
    let driverSigDataUrl: string | undefined;
    if (decl.driver_signature_url) {
      try {
        const res = await fetch(decl.driver_signature_url);
        const blob = await res.blob();
        driverSigDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (e) { console.warn("Could not fetch driver signature", e); }
    }

    const pdf = generateDeclarationPDF({
      driverName: driverFields.driverName || decl.driver_name || "Desconhecido",
      licenseNumber: driverFields.licenseNumber || decl.license_number || "",
      birthDate: driverFields.birthDate || decl.birth_date,
      hireDate: driverFields.hireDate || decl.hire_date,
      gapStartDate: driverFields.gapStartDate || decl.gap_start_date,
      gapEndDate: driverFields.gapEndDate || decl.gap_end_date,
      reasonCode: reasonCode || decl.reason_code || "other",
      reasonText: reasonText || decl.reason_text || undefined,
      managerName: managerName,
      companyName: decl.company_name,
      driverSignatureDataUrl: driverSigDataUrl,
      managerSignatureDataUrl: managerSignatureDataUrl,
      signedAt,
      signedIP: metadata.ip_address,
      verificationId,
      _stampDataUrl: stampDataUrl || undefined,
      ...editFields,
    });

    // Upload PDF
    const pdfBlob = pdf.output("blob");
    const pdfUrl = await uploadSignedPDF(pdfBlob, decl.id);

    return { pdfUrl, metadata, signedAt };
  };

  const handleSignWithSaved = async () => {
    if (!selectedDecl || !savedManagerSig || !user) return;
    setSigning(true);

    try {
      let managerName = profile?.full_name || null;
      // Try to get hub manager
      try {
        const { data: vehicle } = await supabase
          .from("vehicles")
          .select("client_id")
          .eq("current_driver_id", selectedDecl.driver_id)
          .maybeSingle();
        if (vehicle?.client_id) {
          const { data: hub } = await supabase
            .from("hubs")
            .select("traffic_manager_name")
            .eq("client_id", vehicle.client_id)
            .not("traffic_manager_name", "is", null)
            .limit(1)
            .maybeSingle();
          if (hub?.traffic_manager_name) managerName = hub.traffic_manager_name;
        }
      } catch (e) { console.warn("Could not fetch hub manager:", e); }

      // Fetch digitized signature from private bucket as data URL for PDF
      const managerSigDataUrl = await fetchManagerSignatureForPDF(user.id);
      if (!managerSigDataUrl) {
        // Fallback: fetch from the saved URL
        const res = await fetch(savedManagerSig);
        const blob = await res.blob();
        const fallbackDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        var finalManagerSigDataUrl = fallbackDataUrl;
      } else {
        var finalManagerSigDataUrl = managerSigDataUrl;
      }

      // Create audit log first to get verification ID
      const managerAuditVerificationId = await createAuditLog({
        declaration_id: selectedDecl.id,
        signed_by_user_id: user.id,
        signer_role: "manager",
        signer_name: managerName || profile?.full_name || "Gestor",
        signed_at: new Date().toISOString(),
        gps_lat: null,
        gps_lng: null,
        device_info: navigator.userAgent,
        ip_address: (await collectSigningMetadata(user.id)).ip_address,
        signature_url: savedManagerSig,
      });

      const { pdfUrl, metadata } = await generateAndUploadPDF(selectedDecl, finalManagerSigDataUrl, managerName || "—", managerAuditVerificationId);

      // Update audit log with PDF URL
      await supabase
        .from("signature_audit_logs" as any)
        .update({ pdf_url: pdfUrl } as any)
        .eq("verification_id", managerAuditVerificationId);

      const { error } = await supabase
        .from("activity_declarations")
        .update({
          status: "signed",
          reason_code: reasonCode as any,
          reason_text: reasonText || null,
          manager_name: managerName,
          manager_signature_url: savedManagerSig,
          signed_pdf_url: pdfUrl,
          signed_at: new Date().toISOString(),
          signed_ip: metadata.ip_address,
        } as any)
        .eq("id", selectedDecl.id);

      if (error) throw error;

      toast({ title: "Declaração assinada", description: `PDF gerado. ID: ${managerAuditVerificationId}` });
      setSelectedDecl(null);
      fetchDeclarations();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSigning(false);
    }
  };

  const handleManagerSignatureConfirm = async (dataUrl: string) => {
    if (!selectedDecl || !user) return;
    setManagerSigLoading(true);

    try {
      const managerSigUrl = await uploadSignature(dataUrl, user.id, "manager");

      let managerName = profile?.full_name || null;
      try {
        const { data: vehicle } = await supabase
          .from("vehicles")
          .select("client_id")
          .eq("current_driver_id", selectedDecl.driver_id)
          .maybeSingle();
        if (vehicle?.client_id) {
          const { data: hub } = await supabase
            .from("hubs")
            .select("traffic_manager_name")
            .eq("client_id", vehicle.client_id)
            .not("traffic_manager_name", "is", null)
            .limit(1)
            .maybeSingle();
          if (hub?.traffic_manager_name) managerName = hub.traffic_manager_name;
        }
      } catch (e) { console.warn("Could not fetch hub manager:", e); }

      // Create audit log
      const manualVerificationId = await createAuditLog({
        declaration_id: selectedDecl.id,
        signed_by_user_id: user.id,
        signer_role: "manager",
        signer_name: managerName || profile?.full_name || "Gestor",
        signed_at: new Date().toISOString(),
        gps_lat: null,
        gps_lng: null,
        device_info: navigator.userAgent,
        ip_address: (await collectSigningMetadata(user.id)).ip_address,
        signature_url: managerSigUrl,
      });

      const { pdfUrl, metadata } = await generateAndUploadPDF(selectedDecl, dataUrl, managerName || "—", manualVerificationId);

      // Update audit with PDF
      await supabase
        .from("signature_audit_logs" as any)
        .update({ pdf_url: pdfUrl } as any)
        .eq("verification_id", manualVerificationId);

      const { error } = await supabase
        .from("activity_declarations")
        .update({
          status: "signed",
          reason_code: reasonCode as any,
          reason_text: reasonText || null,
          manager_name: managerName,
          manager_signature_url: managerSigUrl,
          signed_pdf_url: pdfUrl,
          signed_at: new Date().toISOString(),
          signed_ip: metadata.ip_address,
        } as any)
        .eq("id", selectedDecl.id);

      if (error) throw error;

      toast({ title: "Declaração assinada", description: `PDF gerado. ID: ${manualVerificationId}` });
      setShowManagerSig(false);
      setSelectedDecl(null);
      fetchDeclarations();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setManagerSigLoading(false);
    }
  };

  const handleSaveManagerSignature = async (dataUrl: string) => {
    if (!user) return;
    setManagerSigLoading(true);
    try {
      const sigUrl = await uploadSignature(dataUrl, user.id, "saved");
      const { error } = await supabase
        .from("profiles")
        .update({ saved_signature_url: sigUrl } as any)
        .eq("id", user.id);
      if (error) throw error;
      setSavedManagerSig(sigUrl);
      setShowSaveSignature(false);
      toast({ title: "Assinatura guardada", description: "Será usada automaticamente nas próximas aprovações." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setManagerSigLoading(false);
    }
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

  const handleDelete = async (id: string) => {
    if (!confirm("Tem a certeza que deseja apagar esta declaração? Esta ação é irreversível.")) return;
    const { error } = await supabase
      .from("activity_declarations")
      .delete()
      .eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Declaração apagada" });
      fetchDeclarations();
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Tem a certeza que deseja apagar ${selectedIds.size} declaração(ões)? Esta ação é irreversível.`)) return;
    const { error } = await supabase
      .from("activity_declarations")
      .delete()
      .in("id", Array.from(selectedIds));
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Declarações apagadas", description: `${selectedIds.size} declaração(ões) removidas.` });
      setSelectedIds(new Set());
      fetchDeclarations();
    }
  };

  const formatDate = (d: string) => format(new Date(d), "dd/MM/yyyy HH:mm", { locale: pt });
  const gapDays = (start: string, end: string) => {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  };

  const pendingCount = declarations.filter((d) => d.status === "draft").length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === declarations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(declarations.map((d) => d.id)));
    }
  };

  // Helper: fetch a remote image URL and return a base64 data URL
  const fetchImageAsDataUrl = async (url: string): Promise<string | undefined> => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn("Could not fetch image for PDF:", e);
      return undefined;
    }
  };

  const buildPdfForDecl = async (d: Declaration) => {
    const [driverSigDataUrl, managerSigDataUrl] = await Promise.all([
      d.driver_signature_url ? fetchImageAsDataUrl(d.driver_signature_url) : Promise.resolve(undefined),
      d.manager_signature_url ? fetchImageAsDataUrl(d.manager_signature_url) : Promise.resolve(undefined),
    ]);

    return {
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
      driverSignatureDataUrl: driverSigDataUrl,
      managerSignatureDataUrl: managerSigDataUrl,
      signedAt: d.signed_pdf_url ? undefined : undefined,
      _stampDataUrl: stampDataUrl || undefined,
      ...editFields,
    };
  };

  const handleBulkDownload = async () => {
    const selected = declarations.filter((d) => selectedIds.has(d.id));
    if (selected.length === 0) return;

    try {
      // First declaration creates the doc
      const doc = generateDeclarationPDF(await buildPdfForDecl(selected[0]));
      // Subsequent declarations append pages
      for (let i = 1; i < selected.length; i++) {
        generateDeclarationPDF(await buildPdfForDecl(selected[i]), { existingDoc: doc });
      }
      const dateSlug = format(new Date(), "yyyyMMdd");
      doc.save(`Declaracoes_Lote_${dateSlug}.pdf`);
      setSelectedIds(new Set());
      toast({ title: "Download concluído", description: `${selected.length} declarações exportadas.` });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleSingleDownload = async (d: Declaration) => {
    try {
      const pdf = generateDeclarationPDF(await buildPdfForDecl(d));
      const driverSlug = (d.driver_name || "motorista").replace(/\s+/g, "_");
      const dateSlug = format(new Date(d.gap_start_date), "yyyyMMdd");
      pdf.save(`Declaracao_Atividade_${driverSlug}_${dateSlug}.pdf`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkRegenerate = async () => {
    const signed = declarations.filter((d) => selectedIds.has(d.id) && d.status === "signed");
    if (signed.length === 0) {
      toast({ title: "Nenhuma declaração assinada selecionada" });
      return;
    }
    let count = 0;
    for (const d of signed) {
      try {
        const pdfData = await buildPdfForDecl(d);
        const pdf = generateDeclarationPDF(pdfData);
        const pdfBlob = pdf.output("blob");
        const pdfUrl = await uploadSignedPDF(pdfBlob, d.id);
        await supabase.from("activity_declarations").update({ signed_pdf_url: pdfUrl } as any).eq("id", d.id);
        count++;
      } catch (err) {
        console.error("Erro ao re-gerar PDF:", err);
      }
    }
    toast({ title: `${count} PDF(s) re-gerado(s)`, description: "Os ficheiros foram atualizados com os dados atuais." });
    setSelectedIds(new Set());
    fetchDeclarations();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Declarações de Atividade</h1>
          <p className="text-sm text-muted-foreground">Regulamento (CE) n.º 561/2006 — Gestão de lacunas de tacógrafo</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => {
            const pdf = generateDeclarationPDF({
              driverName: "JOÃO COSTA",
              licenseNumber: "C-1234567",
              birthDate: "1985-03-15",
              hireDate: "2018-06-01",
              gapStartDate: "2025-01-20T08:00:00Z",
              gapEndDate: "2025-02-03T06:00:00Z",
              reasonCode: "rest",
              managerName: "Carlos Silva",
              managerPosition: "Responsável de Tráfego",
              companyName: "Florêncio e Silva, Lda",
              companyAddress: "Rua Vale Casal, 42, Edf. Florêncio E Silva. Vale Casal, 2665-379, Milharado, Portugal",
              companyPhone: "+351 219667000",
              companyFax: "+351 219667009",
              companyEmail: "florencio.silva@tfs.pt",
              signingLocation: "Azambuja",
              signedAt: new Date().toISOString(),
              signedIP: "192.168.1.1",
              verificationId: "TEST-VERIFY-001",
              _stampDataUrl: stampDataUrl || undefined,
            });
            pdf.save("Declaracao_Teste_JOAO_COSTA.pdf");
          }}>
            <FileText className="h-4 w-4 mr-2" />
            PDF Teste
          </Button>
          <Button variant="outline" onClick={() => setShowSaveSignature(true)}>
            <PenTool className="h-4 w-4 mr-2" />
            {savedManagerSig ? "Atualizar Assinatura" : "Guardar Assinatura"}
          </Button>
          <Button onClick={runCheck} disabled={checking}>
            <RefreshCw className={`h-4 w-4 mr-2 ${checking ? "animate-spin" : ""}`} />
            Verificar Lacunas
          </Button>
        </div>
      </div>

      {/* Saved signature indicator */}
      {savedManagerSig && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Assinatura guardada</p>
              <p className="text-xs text-muted-foreground">Pode aprovar declarações com um clique usando a sua assinatura guardada.</p>
            </div>
            <img src={savedManagerSig} alt="Assinatura" className="h-10 rounded border bg-white px-2" />
          </CardContent>
        </Card>
      )}

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
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Todas as Declarações</CardTitle>
          {selectedIds.size > 0 && (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleBulkDownload}>
                <Download className="h-4 w-4 mr-1" /> Download ({selectedIds.size})
              </Button>
              <Button size="sm" variant="outline" onClick={handleBulkRegenerate}>
                <RefreshCw className="h-4 w-4 mr-1" /> Re-gerar PDFs
              </Button>
              <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                <Trash2 className="h-4 w-4 mr-1" /> Apagar ({selectedIds.size})
              </Button>
            </div>
          )}
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
                    <TableHead className="w-10">
                      <Checkbox
                        checked={declarations.length > 0 && selectedIds.size === declarations.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
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
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(d.id)}
                            onCheckedChange={() => toggleSelect(d.id)}
                          />
                        </TableCell>
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
                              setReasonCode(d.reason_code || "vacation");
                              setReasonText(d.reason_text || "");
                              setDriverFields({
                                driverName: d.driver_name || "",
                                licenseNumber: d.license_number || "",
                                birthDate: d.birth_date || "",
                                hireDate: d.hire_date || "",
                                gapStartDate: d.gap_start_date ? d.gap_start_date.slice(0, 16) : "",
                                gapEndDate: d.gap_end_date ? d.gap_end_date.slice(0, 16) : "",
                              });
                            }}>
                              <FileText className="h-3 w-3 mr-1" /> Assinar
                            </Button>
                          )}
                          {d.status === "signed" && (
                            <>
                              {d.signed_pdf_url ? (
                                <Button size="sm" variant="outline" asChild>
                                  <a href={d.signed_pdf_url} target="_blank" rel="noopener noreferrer">
                                    <Download className="h-3 w-3 mr-1" /> PDF Assinado
                                  </a>
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => handleSingleDownload(d)}>
                                  <Download className="h-3 w-3 mr-1" /> PDF
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => handleArchive(d.id)}>
                                <Archive className="h-3 w-3 mr-1" /> Arquivar
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(d.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
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
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerar e Assinar Declaração</DialogTitle>
          </DialogHeader>

          {selectedDecl && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-1 text-sm">
                <p><strong>Empresa:</strong> {selectedDecl.company_name}</p>
                <p><strong>Gestor:</strong> {profile?.full_name || "—"}</p>
                {selectedDecl.driver_signature_url && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-xs text-primary font-medium">Motorista já assinou</span>
                  </div>
                )}
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

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={() => setSelectedDecl(null)} className="flex-1">Cancelar</Button>
              {savedManagerSig ? (
                <Button onClick={handleSignWithSaved} disabled={signing} className="flex-1">
                  {signing ? "A processar..." : (
                    <><CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar (assinatura guardada)</>
                  )}
                </Button>
              ) : null}
            </div>
            <Button
              variant={savedManagerSig ? "outline" : "default"}
              onClick={() => setShowManagerSig(true)}
              disabled={signing}
              className="w-full"
            >
              <PenTool className="h-4 w-4 mr-1" /> Assinar Manualmente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manager manual signature pad */}
      <SignaturePad
        open={showManagerSig}
        onOpenChange={(o) => !o && setShowManagerSig(false)}
        title="Assinatura do Gestor"
        subtitle="Assine para aprovar esta declaração"
        summaryContent={selectedDecl && (
          <>
            <p><strong>Motorista:</strong> {selectedDecl.driver_name}</p>
            <p><strong>Período:</strong> {formatDate(selectedDecl.gap_start_date)} — {formatDate(selectedDecl.gap_end_date)}</p>
          </>
        )}
        onConfirm={handleManagerSignatureConfirm}
        loading={managerSigLoading}
      />

      {/* Save manager signature pad */}
      <SignaturePad
        open={showSaveSignature}
        onOpenChange={(o) => !o && setShowSaveSignature(false)}
        title="Guardar Assinatura"
        subtitle="Esta assinatura será usada automaticamente ao aprovar declarações com um clique"
        onConfirm={handleSaveManagerSignature}
        loading={managerSigLoading}
      />
    </div>
  );
}
