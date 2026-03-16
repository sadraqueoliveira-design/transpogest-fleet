import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, AlertCircle, Upload, FileText, Trash2, ExternalLink, Pencil, Check, X, Search, Phone } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays, parseISO } from "date-fns";
import { ImportButton, ExportButton } from "@/components/admin/BulkImportExport";

interface Vehicle {
  id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  vin: string | null;
  insurance_expiry: string | null;
  inspection_expiry: string | null;
  tachograph_calibration_date: string | null;
  fuel_level_percent: number | null;
  odometer_km: number | null;
  engine_hours: number | null;
  client_id: string | null;
  mobile_number: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

interface VehicleDoc {
  id: string;
  name: string;
  doc_type: string;
  file_url: string;
  created_at: string;
  expiry_date: string | null;
}

const docTypeLabels: Record<string, string> = {
  insurance: "Seguro", inspection: "Inspeção", registration: "Registo", tachograph: "Tacógrafo",
  community_license: "Licença Comunitária", atp_certificate: "Certificado ATP", vehicle_registration: "Livrete",
  other: "Outro",
};

const FLEET_ALIASES: Record<string, string[]> = {
  plate: ["plate", "matrícula", "matricula", "placa", "reg"],
  brand: ["brand", "marca"],
  model: ["model", "modelo"],
  vin: ["vin", "chassis", "chassi"],
  insurance_expiry: ["insurance_expiry", "seguro", "insurance", "validade seguro"],
  inspection_expiry: ["inspection_expiry", "inspeção", "inspecao", "inspection", "validade inspeção"],
  tachograph_calibration_date: ["tachograph_calibration_date", "tacógrafo", "tacografo", "tachograph", "calibração"],
};

export default function Fleet() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientFilter, setClientFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ plate: "", brand: "", model: "", vin: "", insurance_expiry: "", inspection_expiry: "", tachograph_calibration_date: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Vehicle>>({});
  const [deleteVehicle, setDeleteVehicle] = useState<Vehicle | null>(null);
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleDocs, setVehicleDocs] = useState<VehicleDoc[]>([]);
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("other");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docExpiry, setDocExpiry] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacingDocId, setReplacingDocId] = useState<string | null>(null);

  const fetchVehicles = async () => {
    const [{ data: vData }, { data: cData }] = await Promise.all([
      supabase.from("vehicles").select("*").order("plate"),
      supabase.from("clients").select("id, name").order("name"),
    ]);
    if (vData) setVehicles(vData);
    if (cData) setClients(cData);
    setLoading(false);
  };

  useEffect(() => { fetchVehicles(); }, []);

  const filtered = vehicles.filter(v => {
    if (clientFilter && clientFilter !== "all" && v.client_id !== clientFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const match = v.plate.toLowerCase().includes(s)
        || (v.brand?.toLowerCase().includes(s) ?? false)
        || (v.model?.toLowerCase().includes(s) ?? false)
        || (v.mobile_number?.toLowerCase().includes(s) ?? false);
      if (!match) return false;
    }
    return true;
  });

  const fetchDocs = async (vehicleId: string) => {
    const { data } = await supabase.from("vehicle_documents").select("*").eq("vehicle_id", vehicleId).order("created_at", { ascending: false });
    if (data) setVehicleDocs(data as VehicleDoc[]);
  };

  const openDocsDialog = (vehicle: Vehicle) => { setSelectedVehicle(vehicle); setDocsDialogOpen(true); fetchDocs(vehicle.id); };

  const startEdit = (v: Vehicle) => {
    setEditingId(v.id);
    setEditForm({
      plate: v.plate, brand: v.brand, model: v.model, vin: v.vin,
      insurance_expiry: v.insurance_expiry, inspection_expiry: v.inspection_expiry,
      tachograph_calibration_date: v.tachograph_calibration_date, client_id: v.client_id,
      mobile_number: v.mobile_number,
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("vehicles").update({
      plate: editForm.plate, brand: editForm.brand || null, model: editForm.model || null,
      vin: editForm.vin || null, insurance_expiry: editForm.insurance_expiry || null,
      inspection_expiry: editForm.inspection_expiry || null,
      tachograph_calibration_date: editForm.tachograph_calibration_date || null,
      client_id: editForm.client_id || null,
      mobile_number: editForm.mobile_number || null,
    }).eq("id", editingId);
    if (error) { toast.error("Erro: " + error.message); }
    else { toast.success("Veículo atualizado"); cancelEdit(); fetchVehicles(); }
  };

  const handleDelete = async () => {
    if (!deleteVehicle) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", deleteVehicle.id);
    if (error) { toast.error("Erro ao eliminar: " + error.message); }
    else { toast.success(`Veículo ${deleteVehicle.plate} eliminado`); fetchVehicles(); }
    setDeleteVehicle(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("vehicles").insert({
      plate: form.plate, brand: form.brand || null, model: form.model || null, vin: form.vin || null,
      insurance_expiry: form.insurance_expiry || null, inspection_expiry: form.inspection_expiry || null,
      tachograph_calibration_date: form.tachograph_calibration_date || null,
    });
    if (error) { toast.error("Erro ao criar veículo: " + error.message); }
    else { toast.success("Veículo adicionado"); setOpen(false); setForm({ plate: "", brand: "", model: "", vin: "", insurance_expiry: "", inspection_expiry: "", tachograph_calibration_date: "" }); fetchVehicles(); }
  };

  const handleUploadDoc = async () => {
    if (!docFile || !selectedVehicle || !docName.trim()) { toast.error("Preencha o nome e selecione um ficheiro"); return; }
    setUploading(true);
    const ext = docFile.name.split(".").pop();
    const path = `${selectedVehicle.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("vehicle-docs").upload(path, docFile);
    if (uploadError) { toast.error("Erro ao enviar: " + uploadError.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("vehicle-docs").getPublicUrl(path);
    const finalExpiry = docType === "atp_certificate" && docExpiry ? (() => { const [y, m] = docExpiry.split("-").map(Number); const ld = new Date(y, m, 0).getDate(); return `${y}-${String(m).padStart(2,"0")}-${String(ld).padStart(2,"0")}`; })() : (docExpiry || null);
    const { error } = await supabase.from("vehicle_documents").insert({ vehicle_id: selectedVehicle.id, name: docName.trim(), doc_type: docType, file_url: urlData.publicUrl, uploaded_by: user?.id, expiry_date: finalExpiry } as any);
    if (error) { toast.error("Erro: " + error.message); } else { toast.success("Documento adicionado"); setDocName(""); setDocType("other"); setDocFile(null); setDocExpiry(""); fetchDocs(selectedVehicle.id); }
    setUploading(false);
  };

  const handleDeleteDoc = async (docId: string) => {
    const { error } = await supabase.from("vehicle_documents").delete().eq("id", docId);
    if (error) toast.error(error.message);
    else { toast.success("Documento removido"); if (selectedVehicle) fetchDocs(selectedVehicle.id); }
  };

  const handleReplaceDoc = async (file: File) => {
    if (!replacingDocId || !selectedVehicle || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${selectedVehicle.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("vehicle-docs").upload(path, file);
    if (uploadError) { toast.error("Erro ao enviar: " + uploadError.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("vehicle-docs").getPublicUrl(path);
    const { error } = await supabase.from("vehicle_documents").update({ file_url: urlData.publicUrl } as any).eq("id", replacingDocId);
    if (error) { toast.error("Erro: " + error.message); }
    else { toast.success("Documento substituído"); fetchDocs(selectedVehicle.id); }
    setUploading(false);
    setReplacingDocId(null);
  };

  const expiryBadge = (date: string | null, docType?: string) => {
    if (!date) return null;
    const days = differenceInDays(parseISO(date), new Date());
    const displayDate = docType === "atp_certificate" ? format(parseISO(date), "MM/yyyy") : format(parseISO(date), "dd/MM/yyyy");
    if (days < 0) return <Badge variant="destructive">Expirado</Badge>;
    if (days < 30) return <Badge className="bg-warning text-warning-foreground"><AlertCircle className="mr-1 h-3 w-3" />{days}d</Badge>;
    return <Badge variant="secondary">{displayDate}</Badge>;
  };

  const exportData = filtered.map(v => ({
    Matrícula: v.plate, Marca: v.brand || "", Modelo: v.model || "", VIN: v.vin || "",
    Seguro: v.insurance_expiry || "", Inspeção: v.inspection_expiry || "", Tacógrafo: v.tachograph_calibration_date || "",
    Cliente: clients.find(c => c.id === v.client_id)?.name || "",
  }));

  const handleBulkImport = async (rows: Record<string, string>[]) => {
    const payload = rows.map(r => ({
      plate: r.plate, brand: r.brand || null, model: r.model || null, vin: r.vin || null,
      insurance_expiry: r.insurance_expiry || null, inspection_expiry: r.inspection_expiry || null,
      tachograph_calibration_date: r.tachograph_calibration_date || null,
    }));
    const { error } = await supabase.from("vehicles").upsert(payload, { onConflict: "plate" });
    if (error) throw error;
    toast.success(`${rows.length} veículo(s) importado(s)`);
    fetchVehicles();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-header">Gestão de Frota</h1>
          <p className="page-subtitle">Gerir veículos e documentação</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ImportButton
            columns={["plate", "brand", "model", "vin", "insurance_expiry", "inspection_expiry", "tachograph_calibration_date"]}
            aliases={FLEET_ALIASES}
            requiredColumns={["plate"]}
            validate={(r) => ({ valid: !!r.plate, error: !r.plate ? "Matrícula em falta" : undefined })}
            onImport={handleBulkImport}
            templateHeader="matrícula;marca;modelo;vin;seguro;inspeção;tacógrafo"
            templateExample="12-AB-34;Volvo;FH16;;2026-12-31;2026-06-15;2025-03-01"
            templateFilename="modelo_frota.csv"
          />
          <ExportButton data={exportData} filenameBase="frota" sheetName="Frota" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Novo Veículo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Adicionar Veículo</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Matrícula *</Label><Input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Marca</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Modelo</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
                  <div className="space-y-2"><Label>VIN</Label><Input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Seguro Expira</Label><Input type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Inspeção Expira</Label><Input type="date" value={form.inspection_expiry} onChange={(e) => setForm({ ...form, inspection_expiry: e.target.value })} /></div>
                  <div className="sm:col-span-2 space-y-2"><Label>Calibração Tacógrafo</Label><Input type="date" value={form.tachograph_calibration_date} onChange={(e) => setForm({ ...form, tachograph_calibration_date: e.target.value })} /></div>
                </div>
                <Button type="submit" className="w-full">Adicionar</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Client Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Pesquisar matrícula, marca, modelo ou nº móvel..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={clientFilter || "all"} onValueChange={v => setClientFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Filtrar por cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground whitespace-nowrap">{filtered.length} veículo(s)</span>
      </div>

      {/* Mobile Cards View */}
      <div className="lg:hidden space-y-3">
        {loading ? (
          <p className="text-center py-8 text-muted-foreground">A carregar...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">Nenhum veículo encontrado</p>
        ) : (
          filtered.map((v) => (
            <Card key={v.id}>
              <CardContent className="p-4 space-y-3">
                {editingId === v.id ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Matrícula</Label>
                      <Input value={editForm.plate || ""} onChange={e => setEditForm({...editForm, plate: e.target.value})} className="h-9 font-mono" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label className="text-xs">Marca</Label>
                        <Input value={editForm.brand || ""} onChange={e => setEditForm({...editForm, brand: e.target.value})} className="h-9" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Modelo</Label>
                        <Input value={editForm.model || ""} onChange={e => setEditForm({...editForm, model: e.target.value})} className="h-9" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Cliente</Label>
                      <Select value={editForm.client_id || "none"} onValueChange={val => setEditForm({...editForm, client_id: val === "none" ? null : val})}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Seguro</Label>
                        <Input type="date" value={editForm.insurance_expiry || ""} onChange={e => setEditForm({...editForm, insurance_expiry: e.target.value})} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Inspeção</Label>
                        <Input type="date" value={editForm.inspection_expiry || ""} onChange={e => setEditForm({...editForm, inspection_expiry: e.target.value})} className="h-9" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tacógrafo</Label>
                        <Input type="date" value={editForm.tachograph_calibration_date || ""} onChange={e => setEditForm({...editForm, tachograph_calibration_date: e.target.value})} className="h-9" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={saveEdit}><Check className="mr-1 h-3.5 w-3.5" />Guardar</Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={cancelEdit}><X className="mr-1 h-3.5 w-3.5" />Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-mono font-bold text-base">{v.plate}</p>
                          {v.mobile_number && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              · <Phone className="h-3 w-3" />{v.mobile_number}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</p>
                        <p className="text-xs text-muted-foreground">{clients.find(c => c.id === v.client_id)?.name || "Sem cliente"}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(v)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDocsDialog(v)}>
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteVehicle(v)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Expiry badges */}
                    <div className="flex flex-wrap gap-1.5">
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">Seg:</span>{expiryBadge(v.insurance_expiry) || <span className="text-muted-foreground">—</span>}
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">Insp:</span>{expiryBadge(v.inspection_expiry) || <span className="text-muted-foreground">—</span>}
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">Tac:</span>{expiryBadge(v.tachograph_calibration_date) || <span className="text-muted-foreground">—</span>}
                      </div>
                    </div>

                    {/* Telemetry */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-muted/50 rounded-lg p-2 text-center">
                        <p className="text-muted-foreground">Comb.</p>
                        <p className="font-semibold">{v.fuel_level_percent != null ? `${v.fuel_level_percent}%` : "—"}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2 text-center">
                        <p className="text-muted-foreground">Km</p>
                        <p className="font-semibold">{v.odometer_km != null ? v.odometer_km.toLocaleString() : "—"}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2 text-center">
                        <p className="text-muted-foreground">H. Motor</p>
                        <p className="font-semibold">{v.engine_hours != null ? Math.round(v.engine_hours).toLocaleString("pt-PT") : "—"}</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <Card className="hidden lg:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matrícula</TableHead>
                <TableHead>Nº Móvel</TableHead>
                <TableHead>Marca/Modelo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Seguro</TableHead>
                <TableHead>Inspeção</TableHead>
                <TableHead>Tacógrafo</TableHead>
                <TableHead>Combustível</TableHead>
                <TableHead>Km</TableHead>
                <TableHead>H. Motor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">A carregar...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Nenhum veículo encontrado</TableCell></TableRow>
              ) : (
                filtered.map((v) => (
                  <TableRow key={v.id}>
                    {editingId === v.id ? (
                      <>
                        <TableCell><Input value={editForm.plate || ""} onChange={e => setEditForm({...editForm, plate: e.target.value})} className="h-7 text-xs w-24 font-mono" /></TableCell>
                        <TableCell><Input value={editForm.mobile_number || ""} onChange={e => setEditForm({...editForm, mobile_number: e.target.value})} className="h-7 text-xs w-20" placeholder="Nº" /></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Input value={editForm.brand || ""} onChange={e => setEditForm({...editForm, brand: e.target.value})} placeholder="Marca" className="h-7 text-xs w-20" />
                            <Input value={editForm.model || ""} onChange={e => setEditForm({...editForm, model: e.target.value})} placeholder="Modelo" className="h-7 text-xs w-20" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select value={editForm.client_id || "none"} onValueChange={val => setEditForm({...editForm, client_id: val === "none" ? null : val})}>
                            <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhum</SelectItem>
                              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input type="date" value={editForm.insurance_expiry || ""} onChange={e => setEditForm({...editForm, insurance_expiry: e.target.value})} className="h-7 text-xs w-32" /></TableCell>
                        <TableCell><Input type="date" value={editForm.inspection_expiry || ""} onChange={e => setEditForm({...editForm, inspection_expiry: e.target.value})} className="h-7 text-xs w-32" /></TableCell>
                        <TableCell><Input type="date" value={editForm.tachograph_calibration_date || ""} onChange={e => setEditForm({...editForm, tachograph_calibration_date: e.target.value})} className="h-7 text-xs w-32" /></TableCell>
                        <TableCell>{v.fuel_level_percent != null ? `${v.fuel_level_percent}%` : "—"}</TableCell>
                        <TableCell>{v.odometer_km != null ? `${v.odometer_km.toLocaleString()} km` : "—"}</TableCell>
                        <TableCell>{v.engine_hours != null ? `${Math.round(v.engine_hours).toLocaleString("pt-PT")} h` : "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={saveEdit}><Check className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={cancelEdit}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="font-mono font-semibold">{v.plate}</TableCell>
                        <TableCell>{v.mobile_number ? <span className="flex items-center gap-1 text-sm"><Phone className="h-3 w-3 text-muted-foreground" />{v.mobile_number}</span> : "—"}</TableCell>
                        <TableCell>{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{clients.find(c => c.id === v.client_id)?.name || "—"}</TableCell>
                        <TableCell>{expiryBadge(v.insurance_expiry)}</TableCell>
                        <TableCell>{expiryBadge(v.inspection_expiry)}</TableCell>
                        <TableCell>{expiryBadge(v.tachograph_calibration_date)}</TableCell>
                        <TableCell>{v.fuel_level_percent != null ? `${v.fuel_level_percent}%` : "—"}</TableCell>
                        <TableCell>{v.odometer_km != null ? `${v.odometer_km.toLocaleString()} km` : "—"}</TableCell>
                        <TableCell>{v.engine_hours != null ? `${Math.round(v.engine_hours).toLocaleString("pt-PT")} h` : "—"}</TableCell>
                        <TableCell>
                           <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => startEdit(v)}>
                              <Pencil className="mr-1 h-3 w-3" />Editar
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openDocsDialog(v)}>
                              <FileText className="mr-1 h-3 w-3" />Docs
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteVehicle(v)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Documents Dialog */}
      <Dialog open={docsDialogOpen} onOpenChange={setDocsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Documentos — {selectedVehicle?.plate}</DialogTitle></DialogHeader>
          <div className="space-y-3 border rounded-lg p-3">
            <Label className="text-sm font-semibold">Carregar Documento</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Nome do documento" className="h-8 text-sm" />
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(docTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {docType !== "vehicle_registration" && (
              <Input type={docType === "atp_certificate" ? "month" : "date"} value={docType === "atp_certificate" && docExpiry.length === 10 ? docExpiry.slice(0,7) : docExpiry} onChange={(e) => setDocExpiry(e.target.value)} placeholder={docType === "atp_certificate" ? "Mês/Ano" : "Validade"} className="h-8 text-sm" />
            )}
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-1 h-3 w-3" />{docFile ? docFile.name : "Selecionar Ficheiro"}
              </Button>
              <Button size="sm" onClick={handleUploadDoc} disabled={uploading || !docFile || !docName.trim()}>{uploading ? "A enviar..." : "Enviar"}</Button>
            </div>
          </div>
          <div className="space-y-2">
            {vehicleDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem documentos</p>
            ) : vehicleDocs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between border rounded-lg p-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge variant="secondary" className="text-xs">{docTypeLabels[doc.doc_type] || doc.doc_type}</Badge>
                      {doc.expiry_date && expiryBadge(doc.expiry_date, doc.doc_type)}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" /></a>
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setReplacingDocId(doc.id); replaceInputRef.current?.click(); }} title="Substituir ficheiro">
                    <Upload className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteDoc(doc.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
            <input ref={replaceInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleReplaceDoc(e.target.files[0]); }} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteVehicle} onOpenChange={(o) => !o && setDeleteVehicle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar veículo {deleteVehicle?.plate}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Todos os documentos e registos associados a este veículo serão perdidos.
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
