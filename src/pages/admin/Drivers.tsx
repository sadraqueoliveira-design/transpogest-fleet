import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExportButton, ImportButton } from "@/components/admin/BulkImportExport";
import { Search, Pencil, Save, X, Users, Truck, UserCheck, ArrowUpDown, ArrowUp, ArrowDown, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type SortKey = keyof Employee | null;
type SortDir = "asc" | "desc";

interface Employee {
  id: string;
  employee_number: number;
  full_name: string;
  company: string | null;
  nif: string | null;
  hire_date: string | null;
  birth_date: string | null;
  license_number: string | null;
  category_code: string | null;
  category_description: string | null;
  card_number: string | null;
  card_issue_date: string | null;
  card_start_date: string | null;
  card_expiry_date: string | null;
}

export default function Drivers() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Employee>>({});
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newData, setNewData] = useState<Partial<Employee>>({});
  const [sortKey, setSortKey] = useState<SortKey>("employee_number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortableHead = ({ label, field, className }: { label: string; field: keyof Employee; className?: string }) => (
    <TableHead className={`cursor-pointer select-none hover:text-foreground ${className || ""}`} onClick={() => toggleSort(field)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === field ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </span>
    </TableHead>
  );

  const fetchEmployees = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("employees").select("*").order("employee_number", { ascending: true });
    if (data) setEmployees(data as Employee[]);
    if (error) toast.error("Erro ao carregar funcionários");
    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const filtered = useMemo(() => {
    let list = employees;
    if (filterCompany !== "all") {
      list = list.filter(e => (e.company || "ARV") === filterCompany);
    }
    if (filterCategory === "motorista") {
      list = list.filter(e => e.category_code === "83320");
    } else if (filterCategory === "ajudante") {
      list = list.filter(e => e.category_code === "51110");
    } else if (filterCategory === "outros") {
      list = list.filter(e => e.category_code !== "83320" && e.category_code !== "51110");
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(e =>
        e.full_name.toLowerCase().includes(q) ||
        e.employee_number.toString().includes(q) ||
        (e.nif && e.nif.includes(q))
      );
    }
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const av = a[sortKey] ?? "";
        const bv = b[sortKey] ?? "";
        if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
        return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }
    return list;
  }, [employees, search, sortKey, sortDir, filterCompany, filterCategory]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  useEffect(() => { setPage(1); }, [search, filterCompany, filterCategory]);

  const startEdit = (emp: Employee) => { setEditingId(emp.id); setEditData({ ...emp }); };
  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("employees").update({
      full_name: editData.full_name, company: editData.company, nif: editData.nif,
      hire_date: editData.hire_date, birth_date: editData.birth_date, license_number: editData.license_number,
      category_code: editData.category_code, category_description: editData.category_description,
      card_number: editData.card_number, card_start_date: editData.card_start_date, card_expiry_date: editData.card_expiry_date,
    }).eq("id", editingId);
    if (error) { toast.error("Erro ao guardar"); return; }
    toast.success("Dados atualizados");
    cancelEdit();
    fetchEmployees();
  };

  const saveNew = async () => {
    if (!newData.employee_number || !newData.full_name) { toast.error("Nº Funcionário e Nome são obrigatórios"); return; }
    const { error } = await supabase.from("employees").insert({
      employee_number: Number(newData.employee_number), full_name: newData.full_name,
      company: newData.company || "ARV", nif: newData.nif, hire_date: newData.hire_date,
      birth_date: newData.birth_date, license_number: newData.license_number,
      category_code: newData.category_code, category_description: newData.category_description,
      card_number: newData.card_number, card_start_date: newData.card_start_date, card_expiry_date: newData.card_expiry_date,
    });
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Funcionário adicionado");
    setAddOpen(false); setNewData({}); fetchEmployees();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("employees").delete().eq("id", deleteTarget.id);
    if (error) { toast.error("Erro ao eliminar"); return; }
    toast.success(`${deleteTarget.full_name} eliminado`);
    setDeleteTarget(null); fetchEmployees();
  };

  // Import config
  const importColumns = ["employee_number", "full_name", "company", "nif", "hire_date", "category_code", "category_description", "card_number", "card_start_date", "card_expiry_date"];
  const importAliases: Record<string, string[]> = {
    employee_number: ["funcionário", "funcionario", "nº func", "num func", "employee"],
    full_name: ["nome", "name"], company: ["encarregado", "empresa", "company"], nif: ["contribuinte", "nif"],
    hire_date: ["data contratação", "data contratacao", "hire date"],
    category_code: ["categoria", "category"], category_description: ["descrição cat", "descricao cat", "description"],
    card_number: ["cartão condutor", "cartao condutor", "card number"],
    card_start_date: ["data início", "data inicio", "start date"],
    card_expiry_date: ["data validade", "validade", "expiry"],
  };

  const parseDate = (v: string): string | null => {
    if (!v) return null;
    const parts = v.split("/");
    if (parts.length === 3) {
      const [d, m, y] = parts;
      const year = y.length === 2 ? (Number(y) > 50 ? "19" + y : "20" + y) : y;
      return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return v;
  };

  const handleImport = async (rows: Record<string, string>[]) => {
    const toInsert = rows.map(r => ({
      employee_number: Number(r.employee_number), full_name: r.full_name, company: r.company || "ARV",
      nif: r.nif || null, hire_date: parseDate(r.hire_date), category_code: r.category_code || null,
      category_description: r.category_description || null, card_number: r.card_number || null,
      card_start_date: parseDate(r.card_start_date), card_expiry_date: parseDate(r.card_expiry_date),
    }));
    const { error } = await supabase.from("employees").upsert(toInsert, { onConflict: "employee_number" });
    if (error) throw error;
    toast.success(`${toInsert.length} funcionários importados/atualizados`);
    fetchEmployees();
  };

  // Helpers
  const formatDate = (d: string | null) => { if (!d) return "—"; try { return format(new Date(d), "dd/MM/yyyy"); } catch { return d; } };
  const isExpiringSoon = (d: string | null) => { if (!d) return false; const diff = new Date(d).getTime() - Date.now(); return diff > 0 && diff < 60 * 24 * 60 * 60 * 1000; };
  const isExpired = (d: string | null) => { if (!d) return false; return new Date(d).getTime() < Date.now(); };

  const motoristas = employees.filter(e => e.category_code === "83320").length;
  const ajudantes = employees.filter(e => e.category_code === "51110").length;
  const outros = employees.length - motoristas - ajudantes;

  const exportData = filtered.map(e => ({
    "Nº Func.": e.employee_number, Nome: e.full_name, Empresa: e.company || "", NIF: e.nif || "",
    "Data Nascimento": formatDate(e.birth_date), "Data Contratação": formatDate(e.hire_date),
    "Carta Condução": e.license_number || "", "Código Categoria": e.category_code || "",
    "Descrição Categoria": e.category_description || "",
    "Cartão Condutor": e.card_number || "", "Emissão Cartão": formatDate(e.card_issue_date),
    "Início Cartão": formatDate(e.card_start_date), "Validade Cartão": formatDate(e.card_expiry_date),
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="page-header">Motoristas & Funcionários</h1>
          <p className="page-subtitle">{employees.length} funcionários registados</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ImportButton columns={importColumns} aliases={importAliases} requiredColumns={["employee_number", "full_name"]}
            validate={(row) => {
              if (!row.employee_number || isNaN(Number(row.employee_number))) return { valid: false, error: "Nº funcionário inválido" };
              if (!row.full_name) return { valid: false, error: "Nome em falta" };
              return { valid: true };
            }}
            onImport={handleImport}
            templateHeader="Funcionário;Nome;Encarregado;Contribuinte;Data Contratação;Categoria;Descrição Cat.;Cartão Condutor;Data Início;Data Validade"
            templateExample="1234;João Silva;ARV;123456789;01/01/2020;83320;Motorista de Pesados;5B.000001234;01/01/2025;01/01/2030"
            templateFilename="modelo_funcionarios.csv"
          />
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Novo
          </Button>
          <ExportButton data={exportData} filenameBase="funcionarios" sheetName="Funcionários" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <Truck className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">{motoristas}</p><p className="text-sm text-muted-foreground">Motoristas de Pesados</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <UserCheck className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">{ajudantes}</p><p className="text-sm text-muted-foreground">Ajudantes</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <Users className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">{outros}</p><p className="text-sm text-muted-foreground">Outros</p></div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-xs flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Pesquisar por nome, nº ou NIF..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Empresas</SelectItem>
            <SelectItem value="ARV">ARV</SelectItem>
            <SelectItem value="ART">ART</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Categorias</SelectItem>
            <SelectItem value="motorista">Motoristas</SelectItem>
            <SelectItem value="ajudante">Ajudantes</SelectItem>
            <SelectItem value="outros">Outros</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Funcionário" field="employee_number" className="w-20" />
                  <SortableHead label="Nome" field="full_name" />
                  <SortableHead label="Encarregado" field="company" className="w-16" />
                  <SortableHead label="Contribuinte" field="nif" />
                   <SortableHead label="Data Nascimento" field="birth_date" />
                   <SortableHead label="Data Contratação" field="hire_date" />
                   <SortableHead label="Categoria" field="category_code" />
                   <SortableHead label="Descrição Cat." field="category_description" />
                   <SortableHead label="Carta Condução" field="license_number" />
                  <SortableHead label="Cartão Condutor" field="card_number" />
                  <SortableHead label="Emissão" field="card_issue_date" />
                  <SortableHead label="Data Início" field="card_start_date" />
                  <SortableHead label="Data Validade" field="card_expiry_date" />
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                   <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground">A carregar...</TableCell></TableRow>
                 ) : paginated.length === 0 ? (
                   <TableRow><TableCell colSpan={14} className="text-center py-8 text-muted-foreground">Nenhum funcionário encontrado</TableCell></TableRow>
                ) : (
                  paginated.map((e) => (
                    <TableRow key={e.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailEmployee(e)}>
                      <TableCell className="font-mono text-muted-foreground">{e.employee_number}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{e.full_name}</TableCell>
                      <TableCell><Badge variant={e.company === "ART" ? "outline" : "secondary"}>{e.company || "—"}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{e.nif || "—"}</TableCell>
                       <TableCell className="whitespace-nowrap">{formatDate(e.birth_date)}</TableCell>
                       <TableCell className="whitespace-nowrap">{formatDate(e.hire_date)}</TableCell>
                      <TableCell className="font-mono text-xs">{e.category_code || "—"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{e.category_description || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{e.license_number || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{e.card_number || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(e.card_issue_date)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(e.card_start_date)}</TableCell>
                      <TableCell>
                        {e.card_expiry_date ? (
                          <Badge variant={isExpired(e.card_expiry_date) ? "destructive" : isExpiringSoon(e.card_expiry_date) ? "default" : "secondary"}>
                            {formatDate(e.card_expiry_date)}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={(ev) => { ev.stopPropagation(); startEdit(e); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={(ev) => { ev.stopPropagation(); setDeleteTarget(e); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Mostrar</span>
              <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-[70px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span>de {filtered.length} registos</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detailEmployee} onOpenChange={() => setDetailEmployee(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{detailEmployee?.full_name}</DialogTitle></DialogHeader>
          {detailEmployee && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><Label className="text-muted-foreground">Nº Funcionário</Label><p className="font-mono">{detailEmployee.employee_number}</p></div>
              <div><Label className="text-muted-foreground">Empresa</Label><p>{detailEmployee.company || "—"}</p></div>
              <div><Label className="text-muted-foreground">NIF</Label><p>{detailEmployee.nif || "—"}</p></div>
              <div><Label className="text-muted-foreground">Data Nascimento</Label><p>{formatDate(detailEmployee.birth_date)}</p></div>
              <div><Label className="text-muted-foreground">Data Contratação</Label><p>{formatDate(detailEmployee.hire_date)}</p></div>
              <div><Label className="text-muted-foreground">Carta de Condução</Label><p>{detailEmployee.license_number || "—"}</p></div>
              <div><Label className="text-muted-foreground">Categoria</Label><p>{detailEmployee.category_description || "—"}</p></div>
              <div><Label className="text-muted-foreground">Cód. Categoria</Label><p>{detailEmployee.category_code || "—"}</p></div>
              <div className="col-span-2"><Label className="text-muted-foreground">Cartão Condutor</Label><p className="font-mono">{detailEmployee.card_number || "—"}</p></div>
              <div><Label className="text-muted-foreground">Início Cartão</Label><p>{formatDate(detailEmployee.card_start_date)}</p></div>
              <div><Label className="text-muted-foreground">Validade Cartão</Label>
                <p>{detailEmployee.card_expiry_date ? (
                  <Badge variant={isExpired(detailEmployee.card_expiry_date) ? "destructive" : isExpiringSoon(detailEmployee.card_expiry_date) ? "default" : "secondary"}>
                    {formatDate(detailEmployee.card_expiry_date)}
                  </Badge>
                ) : "—"}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingId} onOpenChange={() => cancelEdit()}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Funcionário #{editData.employee_number}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome</Label><Input value={editData.full_name || ""} onChange={e => setEditData(p => ({ ...p, full_name: e.target.value }))} /></div>
            <div><Label>Empresa</Label><Input value={editData.company || ""} onChange={e => setEditData(p => ({ ...p, company: e.target.value }))} /></div>
            <div><Label>NIF</Label><Input value={editData.nif || ""} onChange={e => setEditData(p => ({ ...p, nif: e.target.value }))} /></div>
            <div><Label>Data Nascimento</Label><Input type="date" value={editData.birth_date || ""} onChange={e => setEditData(p => ({ ...p, birth_date: e.target.value }))} /></div>
            <div><Label>Data Contratação</Label><Input type="date" value={editData.hire_date || ""} onChange={e => setEditData(p => ({ ...p, hire_date: e.target.value }))} /></div>
            <div className="col-span-2"><Label>N.º Carta de Condução</Label><Input value={editData.license_number || ""} onChange={e => setEditData(p => ({ ...p, license_number: e.target.value }))} /></div>
            <div><Label>Categoria</Label><Input value={editData.category_description || ""} onChange={e => setEditData(p => ({ ...p, category_description: e.target.value }))} /></div>
            <div><Label>Cód. Categoria</Label><Input value={editData.category_code || ""} onChange={e => setEditData(p => ({ ...p, category_code: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Cartão Condutor</Label><Input value={editData.card_number || ""} onChange={e => setEditData(p => ({ ...p, card_number: e.target.value }))} /></div>
            <div><Label>Início Cartão</Label><Input type="date" value={editData.card_start_date || ""} onChange={e => setEditData(p => ({ ...p, card_start_date: e.target.value }))} /></div>
            <div><Label>Validade Cartão</Label><Input type="date" value={editData.card_expiry_date || ""} onChange={e => setEditData(p => ({ ...p, card_expiry_date: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={cancelEdit}><X className="h-4 w-4 mr-1" /> Cancelar</Button>
            <Button onClick={saveEdit}><Save className="h-4 w-4 mr-1" /> Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add new employee dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Funcionário</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Nº Funcionário *</Label><Input type="number" value={newData.employee_number || ""} onChange={e => setNewData(p => ({ ...p, employee_number: Number(e.target.value) as any }))} /></div>
            <div><Label>Empresa</Label><Input value={newData.company || "ARV"} onChange={e => setNewData(p => ({ ...p, company: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Nome *</Label><Input value={newData.full_name || ""} onChange={e => setNewData(p => ({ ...p, full_name: e.target.value }))} /></div>
            <div><Label>NIF</Label><Input value={newData.nif || ""} onChange={e => setNewData(p => ({ ...p, nif: e.target.value }))} /></div>
            <div><Label>Data Nascimento</Label><Input type="date" value={newData.birth_date || ""} onChange={e => setNewData(p => ({ ...p, birth_date: e.target.value }))} /></div>
            <div><Label>Data Contratação</Label><Input type="date" value={newData.hire_date || ""} onChange={e => setNewData(p => ({ ...p, hire_date: e.target.value }))} /></div>
            <div className="col-span-2"><Label>N.º Carta de Condução</Label><Input value={newData.license_number || ""} onChange={e => setNewData(p => ({ ...p, license_number: e.target.value }))} /></div>
            <div><Label>Cód. Categoria</Label><Input value={newData.category_code || ""} onChange={e => setNewData(p => ({ ...p, category_code: e.target.value }))} /></div>
            <div><Label>Descrição Categoria</Label><Input value={newData.category_description || ""} onChange={e => setNewData(p => ({ ...p, category_description: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Cartão Condutor</Label><Input value={newData.card_number || ""} onChange={e => setNewData(p => ({ ...p, card_number: e.target.value }))} /></div>
            <div><Label>Data Início Cartão</Label><Input type="date" value={newData.card_start_date || ""} onChange={e => setNewData(p => ({ ...p, card_start_date: e.target.value }))} /></div>
            <div><Label>Data Validade Cartão</Label><Input type="date" value={newData.card_expiry_date || ""} onChange={e => setNewData(p => ({ ...p, card_expiry_date: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setAddOpen(false); setNewData({}); }}><X className="h-4 w-4 mr-1" /> Cancelar</Button>
            <Button onClick={saveNew}><Save className="h-4 w-4 mr-1" /> Criar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar funcionário?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que deseja eliminar <strong>{deleteTarget?.full_name}</strong> (Nº {deleteTarget?.employee_number})? Esta ação não pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
