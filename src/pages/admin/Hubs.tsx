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
  Plus, Search, MapPin, MoreVertical, Trash2, Edit,
  Upload, Download, FileSpreadsheet
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import * as XLSX from "xlsx";

interface Hub {
  id: string;
  client_id: string;
  name: string;
  code: string;
  type: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
}

interface Client {
  id: string;
  name: string;
  code: string;
}

const HUB_TYPES = ["hub", "armazém", "loja", "centro de distribuição", "escritório", "outro"];

function downloadCSVTemplate() {
  const header = "código;nome;tipo;morada;latitude;longitude";
  const example = "LOJA-01;Loja Exemplo;loja;Rua Principal 123, Lisboa;38.7223;-9.1393";
  const blob = new Blob([header + "\n" + example], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo_locais.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const aliases: Record<string, string[]> = {
    code: ["code", "código", "codigo", "cod", "ref"],
    name: ["name", "nome", "designação", "designacao", "local"],
    type: ["type", "tipo"],
    address: ["address", "morada", "endereço", "endereco"],
    lat: ["lat", "latitude"],
    lng: ["lng", "longitude", "long"],
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
  name: string;
  type: string;
  address: string;
  lat: string;
  lng: string;
  valid: boolean;
  error?: string;
}

function parseImportRows(raw: string[][], headerMap: Record<string, number>): ImportRow[] {
  const codeIdx = headerMap.code;
  const nameIdx = headerMap.name;
  if (codeIdx === undefined && nameIdx === undefined) return [];

  return raw.map(row => {
    const code = codeIdx !== undefined ? (row[codeIdx] || "").toString().trim() : "";
    const name = nameIdx !== undefined ? (row[nameIdx] || "").toString().trim() : "";
    const type = headerMap.type !== undefined ? (row[headerMap.type] || "").toString().trim().toLowerCase() : "hub";
    const address = headerMap.address !== undefined ? (row[headerMap.address] || "").toString().trim() : "";
    const lat = headerMap.lat !== undefined ? (row[headerMap.lat] || "").toString().trim() : "";
    const lng = headerMap.lng !== undefined ? (row[headerMap.lng] || "").toString().trim() : "";

    const valid = code.length > 0 && name.length > 0;
    const error = !code ? "Código em falta" : !name ? "Nome em falta" : undefined;

    return { code, name, type: type || "hub", address, lat, lng, valid, error };
  }).filter(r => r.code.length > 0 || r.name.length > 0);
}

export default function Hubs() {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHub, setEditingHub] = useState<Hub | null>(null);
  const [form, setForm] = useState({ name: "", code: "", client_id: "", type: "hub", address: "", lat: "", lng: "" });

  // Import state
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
    if (hubsData) setHubs(hubsData as Hub[]);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = hubs.filter(h => {
    const matchSearch = !search ||
      h.name.toLowerCase().includes(search.toLowerCase()) ||
      h.code.toLowerCase().includes(search.toLowerCase()) ||
      (h.address && h.address.toLowerCase().includes(search.toLowerCase()));
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
      name: form.name, code: form.code, client_id: form.client_id, type: form.type,
      address: form.address || null,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
    };
    if (editingHub) {
      const { error } = await supabase.from("hubs").update(payload).eq("id", editingHub.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Local atualizado");
    } else {
      const { error } = await supabase.from("hubs").insert(payload);
      if (error) { toast.error(error.message.includes("duplicate") ? "Código já existe" : "Erro ao criar"); return; }
      toast.success("Local criado");
    }
    setDialogOpen(false);
    setEditingHub(null);
    setForm({ name: "", code: "", client_id: "", type: "hub", address: "", lat: "", lng: "" });
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("hubs").delete().eq("id", id);
    if (error) { toast.error("Erro ao eliminar"); return; }
    toast.success("Local eliminado");
    fetchData();
  };

  const openEdit = (h: Hub) => {
    setEditingHub(h);
    setForm({
      name: h.name, code: h.code, client_id: h.client_id, type: h.type || "hub",
      address: h.address || "", lat: h.lat?.toString() || "", lng: h.lng?.toString() || "",
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingHub(null);
    setForm({ name: "", code: "", client_id: clientFilter || clients[0]?.id || "", type: "hub", address: "", lat: "", lng: "" });
    setDialogOpen(true);
  };

  // === Export ===
  const handleExport = (format: "csv" | "xlsx") => {
    const data = filtered.map(h => ({
      Código: h.code,
      Nome: h.name,
      Tipo: h.type || "hub",
      Morada: h.address || "",
      Latitude: h.lat ?? "",
      Longitude: h.lng ?? "",
      Cliente: clientMap[h.client_id] || "",
    }));
    if (format === "csv") {
      const header = Object.keys(data[0] || {}).join(";");
      const rows = data.map(r => Object.values(r).join(";"));
      const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "locais.csv"; a.click();
      URL.revokeObjectURL(url);
    } else {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Locais");
      XLSX.writeFile(wb, "locais.xlsx");
    }
  };

  // === Import ===
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
        toast.error("Colunas 'código' ou 'nome' não encontradas"); return;
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
      code: r.code, name: r.name, type: r.type, address: r.address || null,
      lat: r.lat ? parseFloat(r.lat) : null, lng: r.lng ? parseFloat(r.lng) : null,
      client_id: clientFilter,
    }));
    const { error } = await supabase.from("hubs").upsert(payload, { onConflict: "code" });
    setImporting(false);
    if (error) { toast.error("Erro na importação: " + error.message); }
    else { toast.success(`${valid.length} local(is) importado(s)`); setImportDialogOpen(false); setImportRows([]); fetchData(); }
  };

  const validImportCount = importRows.filter(r => r.valid).length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="page-header flex items-center gap-2">
          <MapPin className="h-6 w-6" /> Locais da Rede
        </h1>
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
                  <DialogTitle>{editingHub ? "Editar Local" : "Novo Local"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Cliente</Label>
                    <Select value={form.client_id} onValueChange={v => setForm(f => ({ ...f, client_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                      <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Código</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="Ex: LOJA-01" /></div>
                  <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Loja Azambuja" /></div>
                  <div>
                    <Label>Tipo</Label>
                    <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{HUB_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Morada</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Morada completa" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Latitude</Label><Input value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="39.043168" /></div>
                    <div><Label>Longitude</Label><Input value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} placeholder="-8.918766" /></div>
                  </div>
                  <Button onClick={handleSave} className="w-full">{editingHub ? "Guardar" : "Criar"}</Button>
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

          {!clientFilter && (
            <div className="bg-muted/50 rounded-md p-4 text-sm text-muted-foreground">
              Selecione um cliente acima para ver e gerir os locais. A importação e criação de locais requerem um cliente selecionado.
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Pesquisar por código, nome ou morada..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          {/* Table */}
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Morada</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(h => (
                  <TableRow key={h.id}>
                    <TableCell className="font-mono text-sm">{h.code}</TableCell>
                    <TableCell className="font-medium">{h.name}</TableCell>
                    <TableCell className="capitalize text-sm">{h.type || "hub"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{h.address || "—"}</TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {h.lat && h.lng ? `${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(h)}><Edit className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(h.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Eliminar</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum local encontrado</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Import preview dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" /> Pré-visualização da Importação
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Morada</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows.map((r, i) => (
                  <TableRow key={i} className={!r.valid ? "bg-destructive/5" : ""}>
                    <TableCell className="font-mono">{r.code || "—"}</TableCell>
                    <TableCell>{r.name || "—"}</TableCell>
                    <TableCell className="capitalize">{r.type}</TableCell>
                    <TableCell>{r.address || "—"}</TableCell>
                    <TableCell>{r.valid ? <span className="text-success text-xs">✓</span> : <span className="text-destructive text-xs">{r.error}</span>}</TableCell>
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
