import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ExternalLink, Plus, Camera, Upload, Loader2, Trash2, AlertCircle, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { differenceInDays, format, parseISO } from "date-fns";

interface VehicleDoc {
  id: string;
  name: string;
  doc_type: string;
  file_url: string;
  created_at: string;
  uploaded_by: string | null;
  expiry_date: string | null;
}

const docTypeLabels: Record<string, string> = {
  insurance: "Seguro",
  inspection: "Inspeção",
  registration: "Registo",
  tachograph: "Tacógrafo",
  community_license: "Licença Comunitária",
  atp_certificate: "Certificado ATP",
  vehicle_registration: "Livrete",
  other: "Outro",
};

function ExpiryBadge({ date, docType }: { date: string | null; docType?: string }) {
  if (!date) return null;
  const days = differenceInDays(parseISO(date), new Date());
  const displayDate = docType === "atp_certificate" ? format(parseISO(date), "MM/yyyy") : format(parseISO(date), "dd/MM/yyyy");
  if (days < 0) return <Badge variant="destructive" className="text-[10px] gap-1"><AlertCircle className="h-3 w-3" />Expirado</Badge>;
  if (days < 30) return <Badge className="bg-orange-500/20 text-orange-700 border-orange-300 text-[10px] gap-1"><AlertCircle className="h-3 w-3" />{days}d</Badge>;
  return <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-300"><CalendarDays className="h-3 w-3" />{displayDate}</Badge>;
}

function getExpiryInputType(docType: string): string | null {
  if (docType === "vehicle_registration") return null; // no expiry needed
  if (docType === "atp_certificate") return "month";
  return "date";
}

function normalizeExpiry(docType: string, value: string): string {
  if (docType === "atp_certificate" && value) {
    // value is "YYYY-MM", convert to last day of month
    const [year, month] = value.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }
  return value;
}

export default function DriverDocuments() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<VehicleDoc[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [vehiclePlate, setVehiclePlate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("other");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docExpiry, setDocExpiry] = useState("");
  const [deleteDoc, setDeleteDoc] = useState<VehicleDoc | null>(null);
  const [replacingDocId, setReplacingDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async (vId: string) => {
    const { data } = await supabase
      .from("vehicle_documents")
      .select("*")
      .eq("vehicle_id", vId)
      .order("created_at", { ascending: false });
    if (data) setDocs(data as unknown as VehicleDoc[]);
  };

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      const { data: vehicle } = await supabase
        .from("vehicles")
        .select("id, plate")
        .eq("current_driver_id", user.id)
        .maybeSingle();

      if (!vehicle) { setLoading(false); return; }
      setVehicleId(vehicle.id);
      setVehiclePlate(vehicle.plate);
      await fetchDocs(vehicle.id);
      setLoading(false);
    };
    init();
  }, [user]);

  const handleUpload = async () => {
    if (!docFile || !docName.trim() || !vehicleId || !user) return;
    setUploading(true);
    const ext = docFile.name.split(".").pop() || "jpg";
    const path = `${vehicleId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("vehicle-docs").upload(path, docFile);
    if (uploadError) { toast.error("Erro ao enviar: " + uploadError.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("vehicle-docs").getPublicUrl(path);
    const { error } = await supabase.from("vehicle_documents").insert({
      vehicle_id: vehicleId,
      name: docName.trim(),
      doc_type: docType,
      file_url: urlData.publicUrl,
      uploaded_by: user.id,
      expiry_date: normalizeExpiry(docType, docExpiry) || null,
    } as any);
    if (error) { toast.error("Erro: " + error.message); }
    else {
      toast.success("Documento adicionado");
      setDocName(""); setDocType("other"); setDocFile(null); setDocExpiry("");
      setDialogOpen(false);
      await fetchDocs(vehicleId);
    }
    setUploading(false);
  };

  const handleDelete = async () => {
    if (!deleteDoc || !vehicleId) return;
    const { error } = await supabase.from("vehicle_documents").delete().eq("id", deleteDoc.id);
    if (error) { toast.error("Erro: " + error.message); }
    else { toast.success("Documento eliminado"); await fetchDocs(vehicleId); }
    setDeleteDoc(null);
  };

  const handleReplace = async (file: File) => {
    if (!replacingDocId || !vehicleId || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${vehicleId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("vehicle-docs").upload(path, file);
    if (uploadError) { toast.error("Erro ao enviar: " + uploadError.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("vehicle-docs").getPublicUrl(path);
    const { error } = await supabase.from("vehicle_documents").update({ file_url: urlData.publicUrl } as any).eq("id", replacingDocId);
    if (error) { toast.error("Erro: " + error.message); }
    else { toast.success("Documento substituído"); await fetchDocs(vehicleId); }
    setUploading(false);
    setReplacingDocId(null);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Documentos
        </h1>
        {vehicleId && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Documento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome do documento</Label>
                  <Input value={docName} onChange={e => setDocName(e.target.value)} placeholder="Ex: Seguro 2026" />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={docType} onValueChange={setDocType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(docTypeLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {getExpiryInputType(docType) && (
                  <div>
                    <Label>{docType === "atp_certificate" ? "Validade (Mês/Ano)" : "Data de validade"}</Label>
                    <Input type={getExpiryInputType(docType)!} value={docType === "atp_certificate" && docExpiry.length === 10 ? docExpiry.slice(0, 7) : docExpiry} onChange={e => setDocExpiry(e.target.value)} />
                  </div>
                )}
                <div>
                  <Label>Ficheiro</Label>
                  <div className="flex gap-2 mt-1">
                    <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => { if (e.target.files?.[0]) setDocFile(e.target.files[0]); }} />
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { if (e.target.files?.[0]) setDocFile(e.target.files[0]); }} />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="mr-1 h-3 w-3" />Ficheiro
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()}>
                      <Camera className="mr-1 h-3 w-3" />Câmara
                    </Button>
                  </div>
                  {docFile && <p className="text-xs text-muted-foreground mt-1 truncate">{docFile.name}</p>}
                </div>
                <Button onClick={handleUpload} disabled={uploading || !docFile || !docName.trim()} className="w-full">
                  {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />A enviar...</> : "Guardar Documento"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {vehiclePlate && (
        <p className="text-sm text-muted-foreground">Veículo: <span className="font-mono font-semibold">{vehiclePlate}</span></p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">A carregar...</p>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {vehiclePlate ? "Nenhum documento disponível para este veículo" : "Nenhum veículo atribuído"}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-8 w-8 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{doc.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {docTypeLabels[doc.doc_type] || doc.doc_type}
                      </Badge>
                      <ExpiryBadge date={doc.expiry_date} docType={doc.doc_type} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="outline" size="sm" asChild>
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1 h-3 w-3" />Abrir
                    </a>
                  </Button>
                  {doc.uploaded_by === user?.id && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteDoc(doc)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteDoc} onOpenChange={(o) => !o && setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              O documento "{deleteDoc?.name}" será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
