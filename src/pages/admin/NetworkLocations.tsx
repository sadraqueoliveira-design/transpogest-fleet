import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus, Search, Store, MoreVertical, Trash2, Edit,
  Upload, Download, FileSpreadsheet, Check, X,
  Navigation, Copy, MessageCircle, Phone, ExternalLink
} from "lucide-react";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";

interface Location {
  id: string;
  client_id: string;
  name: string;
  code: string;
  arp2_code: string | null;
  type: string;
  categoria: string | null;
  address: string | null;
  zona_vida: string | null;
  distrito: string | null;
  concelho: string | null;
  freguesia: string | null;
  codigo_postal: string | null;
  localidade: string | null;
  lat: number | null;
  lng: number | null;
  janelas_horarias: string | null;
  ativo: boolean;
  status: string;
}

interface Client {
  id: string;
  name: string;
  code: string;
}

const LOCATION_TYPES = ["loja", "hipermercado", "supermercado", "centro de distribuição", "mfc", "fornecedor", "partenariado", "escritório", "outro"];

function downloadCSVTemplate() {
  const header = "Código Loja;Código ARP2;Nome;Categoria;Tipo;Zona Vida;Distrito;Concelho;Freguesia;Morada;Código Postal;Localidade;Latitude;Longitude;Janelas Horárias;Ativo";
  const example = "01;;Armazém Azambuja;Loja;Centro de Distribuição;;Lisboa;;;Rua da Lezíria do Tejo;;Vila Nova da Rainha;39.04309776;-8.918798729;;Sim";
  const blob = new Blob([header + "\n" + example], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo_locais_rede.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const aliases: Record<string, string[]> = {
    code: ["código loja", "codigo loja", "code", "código", "codigo", "cod"],
    arp2_code: ["código arp2", "codigo arp2", "arp2", "código arp"],
    name: ["nome", "name", "designação", "designacao", "local"],
    categoria: ["categoria"],
    type: ["tipo", "type"],
    zona_vida: ["zona vida", "zona"],
    distrito: ["distrito"],
    concelho: ["concelho"],
    freguesia: ["freguesia"],
    address: ["morada", "address", "endereço", "endereco"],
    codigo_postal: ["código postal", "codigo postal", "cp", "cod postal"],
    localidade: ["localidade"],
    lat: ["latitude", "lat"],
    lng: ["longitude", "long", "lng"],
    janelas_horarias: ["janelas horárias", "janelas horarias", "janelas"],
    ativo: ["ativo", "active"],
  };
  headers.forEach((h, i) => {
    const normalized = h.toLowerCase().trim().replace(/[_\-]/g, " ");
    for (const [key, variants] of Object.entries(aliases)) {
      if (variants.some(v => normalized === v || normalized.includes(v))) {
        if (!(key in map)) map[key] = i;
      }
    }
  });
  return map;
}

interface ImportRow {
  code: string;
  arp2_code: string;
  name: string;
  categoria: string;
  type: string;
  zona_vida: string;
  distrito: string;
  concelho: string;
  freguesia: string;
  address: string;
  codigo_postal: string;
  localidade: string;
  lat: string;
  lng: string;
  janelas_horarias: string;
  ativo: boolean;
  valid: boolean;
  error?: string;
}

const ALL_IMPORT_FIELDS = [
  "code", "arp2_code", "name", "categoria", "type", "zona_vida", "distrito",
  "concelho", "freguesia", "address", "codigo_postal", "localidade", "lat", "lng",
  "janelas_horarias", "ativo",
] as const;

function parseImportRows(raw: string[][], headerMap: Record<string, number>): ImportRow[] {
  return raw.map(row => {
    const get = (key: string) => headerMap[key] !== undefined ? (row[headerMap[key]] || "").toString().trim() : "";
    const code = get("code");
    const name = get("name");
    const ativoStr = get("ativo").toLowerCase();
    const ativo = ativoStr === "" || ativoStr === "sim" || ativoStr === "yes" || ativoStr === "true" || ativoStr === "1";

    const valid = code.length > 0 && name.length > 0;
    const error = !code ? "Código em falta" : !name ? "Nome em falta" : undefined;

    return {
      code, arp2_code: get("arp2_code"), name, categoria: get("categoria"),
      type: get("type") || "loja", zona_vida: get("zona_vida"), distrito: get("distrito"),
      concelho: get("concelho"), freguesia: get("freguesia"), address: get("address"),
      codigo_postal: get("codigo_postal"), localidade: get("localidade"),
      lat: get("lat"), lng: get("lng"), janelas_horarias: get("janelas_horarias"),
      ativo, valid, error,
    };
  }).filter(r => r.code.length > 0 || r.name.length > 0);
}

// Only show these types in this page
const NETWORK_TYPE_FILTER = ["loja", "hipermercado", "supermercado", "centro de distribuição", "mfc", "fornecedor", "partenariado", "escritório", "outro"];

export default function NetworkLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [form, setForm] = useState({ name: "", code: "", arp2_code: "", client_id: "", type: "loja", address: "", lat: "", lng: "" });

  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    const [{ data: hubsData }, { data: clientsData }] = await Promise.all([
      supabase.from("hubs").select("*").order("name"),
      supabase.from("clients").select("id, name, code").order("name"),
    ]);
    if (clientsData) setClients(clientsData);
    if (hubsData) setLocations(hubsData as unknown as Location[]);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = locations.filter(h => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      h.name.toLowerCase().includes(s) ||
      h.code.toLowerCase().includes(s) ||
      (h.arp2_code && h.arp2_code.toLowerCase().includes(s)) ||
      (h.address && h.address.toLowerCase().includes(s)) ||
      (h.localidade && h.localidade.toLowerCase().includes(s));
    const matchClient = !clientFilter || clientFilter === "all_clients_placeholder" || h.client_id === clientFilter;
    return matchSearch && matchClient;
  });

  const clientMap: Record<string, string> = {};
  clients.forEach(c => { clientMap[c.id] = c.name; });

  const handleSave = async () => {
    if (!form.name || !form.code || !form.client_id) {
      toast.error("Nome, código e cliente são obrigatórios"); return;
    }
    const payload = {
      name: form.name, code: form.code, arp2_code: form.arp2_code || null,
      client_id: form.client_id, type: form.type,
      address: form.address || null,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
    } as any;
    if (editingLocation) {
      const { error } = await supabase.from("hubs").update(payload).eq("id", editingLocation.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Local atualizado");
    } else {
      const { error } = await supabase.from("hubs").insert(payload);
      if (error) { toast.error(error.message.includes("duplicate") ? "Código já existe" : "Erro ao criar"); return; }
      toast.success("Local criado");
    }
    setDialogOpen(false);
    setEditingLocation(null);
    setForm({ name: "", code: "", arp2_code: "", client_id: "", type: "loja", address: "", lat: "", lng: "" });
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("hubs").delete().eq("id", id);
    if (error) { toast.error("Erro ao eliminar"); return; }
    toast.success("Local eliminado");
    fetchData();
  };

  const openEdit = (h: Location) => {
    setEditingLocation(h);
    setForm({
      name: h.name, code: h.code, arp2_code: h.arp2_code || "",
      client_id: h.client_id, type: h.type || "loja",
      address: h.address || "", lat: h.lat?.toString() || "", lng: h.lng?.toString() || "",
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingLocation(null);
    setForm({ name: "", code: "", arp2_code: "", client_id: clientFilter || clients[0]?.id || "", type: "loja", address: "", lat: "", lng: "" });
    setDialogOpen(true);
  };

  const handleExport = (format: "csv" | "xlsx") => {
    const data = filtered.map(h => ({
      "Código Loja": h.code, "Código ARP2": h.arp2_code || "", Nome: h.name,
      Categoria: h.categoria || "", Tipo: h.type || "loja",
      "Zona Vida": h.zona_vida || "", Distrito: h.distrito || "",
      Concelho: h.concelho || "", Freguesia: h.freguesia || "",
      Morada: h.address || "", "Código Postal": h.codigo_postal || "",
      Localidade: h.localidade || "",
      Latitude: h.lat ?? "", Longitude: h.lng ?? "",
      "Janelas Horárias": h.janelas_horarias || "",
      Ativo: h.ativo ? "Sim" : "Não",
      Cliente: clientMap[h.client_id] || "",
    }));
    if (data.length === 0) { toast.error("Sem dados para exportar"); return; }
    if (format === "csv") {
      const header = Object.keys(data[0]).join(";");
      const rows = data.map(r => Object.values(r).join(";"));
      const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "locais_rede.csv"; a.click();
      URL.revokeObjectURL(url);
    } else {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Locais");
      XLSX.writeFile(wb, "locais_rede.xlsx");
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let lines: string[][] = [];
      if (ext === "csv") {
        const text = await file.text();
        lines = text.split(/\r?\n/).map(l => l.split(/[;,]/));
      } else if (ext === "xlsx" || ext === "xls") {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        lines = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as string[][];
      } else {
        toast.error("Formato não suportado. Use CSV ou XLSX."); return;
      }
      if (lines.length < 2) { toast.error("Ficheiro vazio"); return; }
      const headerMap = normalizeHeaders(lines[0].map(String));
      if (headerMap.code === undefined && headerMap.name === undefined) {
        toast.error("Colunas 'Código Loja' ou 'Nome' não encontradas"); return;
      }
      setImportRows(parseImportRows(lines.slice(1), headerMap));
      setImportDialogOpen(true);
    } catch { toast.error("Erro ao ler ficheiro"); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleImport = async () => {
    if (!clientFilter) { toast.error("Selecione um cliente antes de importar"); return; }
    const valid = importRows.filter(r => r.valid);
    if (valid.length === 0) return;
    setImporting(true);
    const payload = valid.map(r => ({
      code: r.code,
      arp2_code: r.arp2_code || null,
      name: r.name,
      categoria: r.categoria || null,
      type: r.type?.toLowerCase() || "loja",
      zona_vida: r.zona_vida || null,
      distrito: r.distrito || null,
      concelho: r.concelho || null,
      freguesia: r.freguesia || null,
      address: r.address || null,
      codigo_postal: r.codigo_postal || null,
      localidade: r.localidade || null,
      lat: r.lat ? parseFloat(r.lat) : null,
      lng: r.lng ? parseFloat(r.lng) : null,
      janelas_horarias: r.janelas_horarias || null,
      ativo: r.ativo,
      client_id: clientFilter,
    }));
    const { error } = await supabase.from("hubs").upsert(payload as any, { onConflict: "code" });
    setImporting(false);
    if (error) { toast.error("Erro na importação: " + error.message); }
    else { toast.success(`${valid.length} local(is) importado(s)`); setImportDialogOpen(false); setImportRows([]); fetchData(); }
  };

  const validImportCount = importRows.filter(r => r.valid).length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="page-header flex items-center gap-2">
          <Store className="h-6 w-6" /> Locais da Rede
        </h1>
        <p className="page-subtitle">Lojas, fornecedores, armazéns e centros de distribuição</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={downloadCSVTemplate} className="gap-2">
              <Download className="h-4 w-4" /> Modelo CSV
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
            <Button variant="outline" onClick={() => { if (!clientFilter) { toast.error("Selecione um cliente primeiro"); return; } fileRef.current?.click(); }} className="gap-2">
              <Upload className="h-4 w-4" /> Importar
            </Button>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openNew} className="bg-success hover:bg-success/90 gap-2">
                  <Plus className="h-4 w-4" /> Novo Local
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingLocation ? "Editar Local" : "Novo Local"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Cliente</Label>
                    <Select value={form.client_id} onValueChange={v => setForm(f => ({ ...f, client_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                      <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Código Loja</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="Ex: 01" /></div>
                    <div><Label>Código ARP2</Label><Input value={form.arp2_code} onChange={e => setForm(f => ({ ...f, arp2_code: e.target.value }))} placeholder="Ex: ARP-01" /></div>
                  </div>
                  <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Loja Azambuja" /></div>
                  <div>
                    <Label>Tipo</Label>
                    <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{LOCATION_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Morada</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Morada completa" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Latitude</Label><Input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="39.043168" /></div>
                    <div><Label>Longitude</Label><Input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} placeholder="-8.918766" /></div>
                  </div>
                  <Button onClick={handleSave} className="w-full">{editingLocation ? "Guardar" : "Criar"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Export */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2"><FileSpreadsheet className="h-4 w-4" /> Exportar</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport("csv")}>Exportar CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx")}>Exportar XLSX</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Client filter */}
          <div className="flex items-center gap-2">
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_clients_placeholder">Todos os clientes</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Pesquisar por Código Loja, Código ARP2, nome ou localidade..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          {/* Table */}
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cód. Loja</TableHead>
                  <TableHead>Cód. ARP2</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Localidade</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(h => (
                  <TableRow key={h.id}>
                    <TableCell className="font-mono text-sm">{h.code}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{h.arp2_code || "—"}</TableCell>
                    <TableCell className="font-medium">{h.name}</TableCell>
                    <TableCell className="capitalize text-sm">{h.type || "loja"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{h.localidade || h.address || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{clientMap[h.client_id] || "—"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onClick={() => openEdit(h)}><Edit className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(h.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Eliminar</DropdownMenuItem>

                          {h.lat && h.lng && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`, "_blank")}>
                                <ExternalLink className="h-4 w-4 mr-2" />Google Maps
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => window.open(`https://waze.com/ul?ll=${h.lat},${h.lng}&navigate=yes`, "_blank")}>
                                <Navigation className="h-4 w-4 mr-2" />Waze
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => window.open(`https://share.here.com/l/${h.lat},${h.lng}`, "_blank")}>
                                <ExternalLink className="h-4 w-4 mr-2" />HERE Go
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => window.open(`https://www.sygic.com/gps-navigation/maps/point?coordinate=${h.lat}|${h.lng}`, "_blank")}>
                                <ExternalLink className="h-4 w-4 mr-2" />Sygic Truck
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => {
                                const text = `${h.name}\n${h.address || ""}\nhttps://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`;
                                navigator.clipboard.writeText(text);
                                toast.success("Copiado para a área de transferência");
                              }}>
                                <Copy className="h-4 w-4 mr-2" />Copiar morada + link
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                const text = encodeURIComponent(`${h.name}\n${h.address || ""}\nhttps://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`);
                                window.open(`https://wa.me/?text=${text}`, "_blank");
                              }}>
                                <MessageCircle className="h-4 w-4 mr-2" />Enviar por WhatsApp
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                const text = encodeURIComponent(`${h.name} - ${h.address || ""} https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`);
                                window.open(`sms:?body=${text}`, "_blank");
                              }}>
                                <Phone className="h-4 w-4 mr-2" />Enviar por SMS
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum local encontrado</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground text-right">{filtered.length} local(is)</p>
        </CardContent>
      </Card>

      {/* Import Preview Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" /> Pré-visualização da Importação
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary" className="gap-1"><Check className="h-3 w-3" />{validImportCount} válidos</Badge>
            {importRows.length - validImportCount > 0 && (
              <Badge variant="destructive" className="gap-1"><X className="h-3 w-3" />{importRows.length - validImportCount} com erros</Badge>
            )}
          </div>
          <div className="overflow-auto flex-1 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Cód. Loja</TableHead>
                  <TableHead>Cód. ARP2</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Localidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows.map((r, i) => (
                  <TableRow key={i} className={r.valid ? "" : "bg-destructive/5"}>
                    <TableCell>{r.valid ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-destructive" />}</TableCell>
                    <TableCell className="font-mono text-sm">{r.code || "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{r.arp2_code || "—"}</TableCell>
                    <TableCell>{r.name || "—"}</TableCell>
                    <TableCell className="capitalize text-sm">{r.type}</TableCell>
                    <TableCell className="text-sm">{r.localidade || r.address || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleImport} disabled={importing || validImportCount === 0}>
              {importing ? "A importar..." : `Importar ${validImportCount} local(is)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
