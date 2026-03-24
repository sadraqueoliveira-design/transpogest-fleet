import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Camera, ImagePlus, X, Loader2, Clock, CheckCircle2, XCircle, Eye, Ban } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const typeMap: Record<string, string> = {
  Uniform: "Fardamento", Vacation: "Férias", Absence: "Falta", JustifiedAbsence: "Falta Justificada",
  DayOff: "Folga", SickLeave: "Baixa Médica", Insurance: "Seguro", Document: "Documento", Other: "Outro",
};

const statusConfig: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" }> = {
  pending: { label: "Pendente", icon: Clock, variant: "default" },
  approved: { label: "Aprovado", icon: CheckCircle2, variant: "secondary" },
  rejected: { label: "Rejeitado", icon: XCircle, variant: "destructive" },
};

export default function DriverRequests() {
  const { user } = useAuth();
  const [type, setType] = useState<string>("Uniform");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const fetchHistory = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("service_requests")
      .select("*")
      .eq("driver_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setHistory(data);
    setHistoryLoading(false);
  };

  useEffect(() => { fetchHistory(); }, [user]);

  const uploadFile = async (file: File) => {
    if (!user) return null;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("request-attachments")
      .upload(path, file, { upsert: false });
    setUploading(false);
    if (error) {
      toast.error("Erro ao carregar ficheiro");
      return null;
    }
    const { data: urlData } = supabase.storage
      .from("request-attachments")
      .getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Ficheiro demasiado grande (máx 10MB)");
        continue;
      }
      const url = await uploadFile(file);
      if (url) setAttachments((prev) => [...prev, url]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload: Record<string, any> = { ...details };
    if (attachments.length > 0) payload.attachments = attachments;

    const { error } = await supabase.from("service_requests").insert({
      driver_id: user?.id,
      type: type as any,
      details: payload,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Pedido enviado com sucesso!");
      setDetails({});
      setAttachments([]);
      fetchHistory();
    }
    setLoading(false);
  };

  const cancelRequest = async (id: string) => {
    const { error } = await supabase.from("service_requests").delete().eq("id", id).eq("driver_id", user?.id).eq("status", "pending");
    if (error) toast.error("Erro ao cancelar pedido");
    else {
      toast.success("Pedido cancelado");
      fetchHistory();
    }
  };

  const showDateFields = ["Vacation", "Absence", "SickLeave", "Insurance"].includes(type);
  const showAttachments = ["Absence", "SickLeave", "Insurance", "Document", "Other"].includes(type);

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold">Solicitações</h1>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Pedido</Label>
              <Select value={type} onValueChange={(v) => { setType(v); setDetails({}); setAttachments([]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Uniform">Fardamento</SelectItem>
                  <SelectItem value="Vacation">Férias</SelectItem>
                  <SelectItem value="Absence">Falta</SelectItem>
                  <SelectItem value="DayOff">Folga</SelectItem>
                  <SelectItem value="SickLeave">Baixa Médica</SelectItem>
                  <SelectItem value="Insurance">Seguro</SelectItem>
                  <SelectItem value="Document">Documento</SelectItem>
                  <SelectItem value="Other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {type === "Uniform" && (
              <div className="space-y-2">
                <Label>Tamanho</Label>
                <Select value={details.size || ""} onValueChange={(v) => setDetails({ ...details, size: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar tamanho" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="S">S</SelectItem>
                    <SelectItem value="M">M</SelectItem>
                    <SelectItem value="L">L</SelectItem>
                    <SelectItem value="XL">XL</SelectItem>
                    <SelectItem value="XXL">XXL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {showDateFields && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data Início</Label>
                  <Input type="date" value={details.start_date || ""} onChange={(e) => setDetails({ ...details, start_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Data Fim</Label>
                  <Input type="date" value={details.end_date || ""} onChange={(e) => setDetails({ ...details, end_date: e.target.value })} />
                </div>
              </div>
            )}

            {(type === "Absence" || type === "SickLeave" || type === "Insurance") && (
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Input
                  value={details.reason || ""}
                  onChange={(e) => setDetails({ ...details, reason: e.target.value })}
                  placeholder={
                    type === "SickLeave" ? "Ex: Consulta médica, hospitalização..."
                    : type === "Insurance" ? "Ex: Acidente de trabalho, sinistro..."
                    : "Ex: Motivo da falta..."
                  }
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={details.notes || ""} onChange={(e) => setDetails({ ...details, notes: e.target.value })} placeholder="Detalhes adicionais..." rows={3} />
            </div>

            {showAttachments && (
              <div className="space-y-3">
                <Label>Comprovativos</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()} disabled={uploading}>
                    <Camera className="h-4 w-4 mr-1" /> Câmara
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <ImagePlus className="h-4 w-4 mr-1" /> Galeria
                  </Button>
                  {uploading && <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground" />}
                </div>
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                <input ref={fileInputRef} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

                {attachments.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {attachments.map((url, i) => (
                      <div key={i} className="relative group rounded-md overflow-hidden border border-border">
                        <img src={url} alt={`Anexo ${i + 1}`} className="w-full h-20 object-cover" />
                        <button
                          type="button"
                          onClick={() => removeAttachment(i)}
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading || uploading}>
              {loading ? "A enviar..." : "Enviar Pedido"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Request History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico de Pedidos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {historyLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sem pedidos anteriores</p>
          ) : (
            history.map((r) => {
              const sc = statusConfig[r.status] || statusConfig.pending;
              const StatusIcon = sc.icon;
              const atts: string[] = r.details?.attachments || [];
              return (
                <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
                  <StatusIcon className={`h-5 w-5 shrink-0 mt-0.5 ${
                    r.status === "approved" ? "text-success" : r.status === "rejected" ? "text-destructive" : "text-warning"
                  }`} />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{typeMap[r.type] || r.type}</Badge>
                      <Badge variant={sc.variant} className="text-xs">{sc.label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {r.details?.reason && <p>{r.details.reason}</p>}
                      {r.details?.start_date && (
                        <p>{r.details.start_date}{r.details.end_date ? ` → ${r.details.end_date}` : ""}</p>
                      )}
                      {r.details?.notes && <p className="line-clamp-1">{r.details.notes}</p>}
                    </div>
                    {atts.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {atts.slice(0, 4).map((url: string, i: number) => (
                          <button key={i} onClick={() => setPreviewUrl(url)}
                            className="h-8 w-8 rounded border border-border overflow-hidden hover:ring-2 hover:ring-primary transition-all">
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                        {atts.length > 4 && <span className="text-xs text-muted-foreground self-center">+{atts.length - 4}</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground/60">
                        {new Date(r.created_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {r.status === "pending" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive hover:text-destructive">
                              <Ban className="h-3 w-3 mr-1" /> Cancelar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancelar pedido?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação é irreversível. O pedido será eliminado.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Não</AlertDialogCancel>
                              <AlertDialogAction onClick={() => cancelRequest(r.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Sim, cancelar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Comprovativo</DialogTitle></DialogHeader>
          {previewUrl && <img src={previewUrl} alt="Comprovativo" className="w-full rounded-md" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
