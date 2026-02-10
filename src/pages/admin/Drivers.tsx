import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ExportButton } from "@/components/admin/BulkImportExport";
import { Search, Pencil, Save, X, Users, Truck, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Employee {
  id: string;
  employee_number: number;
  full_name: string;
  company: string | null;
  nif: string | null;
  hire_date: string | null;
  category_code: string | null;
  category_description: string | null;
  card_number: string | null;
  card_start_date: string | null;
  card_expiry_date: string | null;
}

export default function Drivers() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Employee>>({});
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);

  const fetchEmployees = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .order("employee_number", { ascending: true });
    if (data) setEmployees(data as Employee[]);
    if (error) toast.error("Erro ao carregar funcionários");
    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.toLowerCase().trim();
    return employees.filter(e =>
      e.full_name.toLowerCase().includes(q) ||
      e.employee_number.toString().includes(q) ||
      (e.nif && e.nif.includes(q))
    );
  }, [employees, search]);

  const startEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setEditData({ ...emp });
  };

  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("employees").update({
      full_name: editData.full_name,
      company: editData.company,
      nif: editData.nif,
      hire_date: editData.hire_date,
      category_code: editData.category_code,
      category_description: editData.category_description,
      card_number: editData.card_number,
      card_start_date: editData.card_start_date,
      card_expiry_date: editData.card_expiry_date,
    }).eq("id", editingId);
    if (error) { toast.error("Erro ao guardar"); return; }
    toast.success("Dados atualizados");
    setEditingId(null);
    setEditData({});
    fetchEmployees();
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yyyy"); } catch { return d; }
  };

  const isExpiringSoon = (d: string | null) => {
    if (!d) return false;
    const diff = new Date(d).getTime() - Date.now();
    return diff > 0 && diff < 60 * 24 * 60 * 60 * 1000;
  };

  const isExpired = (d: string | null) => {
    if (!d) return false;
    return new Date(d).getTime() < Date.now();
  };

  const motoristas = employees.filter(e => e.category_code === "83320").length;
  const ajudantes = employees.filter(e => e.category_code === "51110").length;
  const outros = employees.length - motoristas - ajudantes;

  const exportData = filtered.map(e => ({
    "Nº Func.": e.employee_number,
    Nome: e.full_name,
    Empresa: e.company || "",
    NIF: e.nif || "",
    "Data Contratação": formatDate(e.hire_date),
    Categoria: e.category_description || "",
    "Cartão Condutor": e.card_number || "",
    "Validade Cartão": formatDate(e.card_expiry_date),
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="page-header">Motoristas & Funcionários</h1>
          <p className="page-subtitle">{employees.length} funcionários registados</p>
        </div>
        <ExportButton data={exportData} filenameBase="funcionarios" sheetName="Funcionários" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Truck className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{motoristas}</p>
              <p className="text-sm text-muted-foreground">Motoristas de Pesados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <UserCheck className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{ajudantes}</p>
              <p className="text-sm text-muted-foreground">Ajudantes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{outros}</p>
              <p className="text-sm text-muted-foreground">Outros</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por nome, nº funcionário ou NIF..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Nº Func.</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-16">Empresa</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Cartão Condutor</TableHead>
                  <TableHead>Validade Cartão</TableHead>
                  <TableHead className="w-20">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">A carregar...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum funcionário encontrado</TableCell></TableRow>
                ) : (
                  filtered.map((e) => (
                    <TableRow key={e.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailEmployee(e)}>
                      <TableCell className="font-mono text-muted-foreground">{e.employee_number}</TableCell>
                      <TableCell className="font-medium">{e.full_name}</TableCell>
                      <TableCell>
                        <Badge variant={e.company === "ART" ? "outline" : "secondary"}>{e.company || "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{e.category_description || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{e.card_number || "—"}</TableCell>
                      <TableCell>
                        {e.card_expiry_date ? (
                          <Badge variant={isExpired(e.card_expiry_date) ? "destructive" : isExpiringSoon(e.card_expiry_date) ? "default" : "secondary"}>
                            {formatDate(e.card_expiry_date)}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={(ev) => { ev.stopPropagation(); startEdit(e); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detailEmployee} onOpenChange={() => setDetailEmployee(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailEmployee?.full_name}</DialogTitle>
          </DialogHeader>
          {detailEmployee && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><Label className="text-muted-foreground">Nº Funcionário</Label><p className="font-mono">{detailEmployee.employee_number}</p></div>
              <div><Label className="text-muted-foreground">Empresa</Label><p>{detailEmployee.company || "—"}</p></div>
              <div><Label className="text-muted-foreground">NIF</Label><p>{detailEmployee.nif || "—"}</p></div>
              <div><Label className="text-muted-foreground">Data Contratação</Label><p>{formatDate(detailEmployee.hire_date)}</p></div>
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
          <DialogHeader>
            <DialogTitle>Editar Funcionário #{editData.employee_number}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Nome</Label>
              <Input value={editData.full_name || ""} onChange={e => setEditData(p => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div>
              <Label>Empresa</Label>
              <Input value={editData.company || ""} onChange={e => setEditData(p => ({ ...p, company: e.target.value }))} />
            </div>
            <div>
              <Label>NIF</Label>
              <Input value={editData.nif || ""} onChange={e => setEditData(p => ({ ...p, nif: e.target.value }))} />
            </div>
            <div>
              <Label>Data Contratação</Label>
              <Input type="date" value={editData.hire_date || ""} onChange={e => setEditData(p => ({ ...p, hire_date: e.target.value }))} />
            </div>
            <div>
              <Label>Categoria</Label>
              <Input value={editData.category_description || ""} onChange={e => setEditData(p => ({ ...p, category_description: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Cartão Condutor</Label>
              <Input value={editData.card_number || ""} onChange={e => setEditData(p => ({ ...p, card_number: e.target.value }))} />
            </div>
            <div>
              <Label>Início Cartão</Label>
              <Input type="date" value={editData.card_start_date || ""} onChange={e => setEditData(p => ({ ...p, card_start_date: e.target.value }))} />
            </div>
            <div>
              <Label>Validade Cartão</Label>
              <Input type="date" value={editData.card_expiry_date || ""} onChange={e => setEditData(p => ({ ...p, card_expiry_date: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={cancelEdit}><X className="h-4 w-4 mr-1" /> Cancelar</Button>
            <Button onClick={saveEdit}><Save className="h-4 w-4 mr-1" /> Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
