import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays, parseISO } from "date-fns";

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
}

export default function Fleet() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ plate: "", brand: "", model: "", vin: "", insurance_expiry: "", inspection_expiry: "", tachograph_calibration_date: "" });

  const fetchVehicles = async () => {
    const { data } = await supabase.from("vehicles").select("*").order("plate");
    if (data) setVehicles(data);
    setLoading(false);
  };

  useEffect(() => { fetchVehicles(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("vehicles").insert({
      plate: form.plate,
      brand: form.brand || null,
      model: form.model || null,
      vin: form.vin || null,
      insurance_expiry: form.insurance_expiry || null,
      inspection_expiry: form.inspection_expiry || null,
      tachograph_calibration_date: form.tachograph_calibration_date || null,
    });
    if (error) {
      toast.error("Erro ao criar veículo: " + error.message);
    } else {
      toast.success("Veículo adicionado com sucesso");
      setOpen(false);
      setForm({ plate: "", brand: "", model: "", vin: "", insurance_expiry: "", inspection_expiry: "", tachograph_calibration_date: "" });
      fetchVehicles();
    }
  };

  const expiryBadge = (date: string | null) => {
    if (!date) return null;
    const days = differenceInDays(parseISO(date), new Date());
    if (days < 0) return <Badge variant="destructive">Expirado</Badge>;
    if (days < 30) return <Badge className="bg-warning text-warning-foreground"><AlertCircle className="mr-1 h-3 w-3" />{days}d</Badge>;
    return <Badge variant="secondary">{format(parseISO(date), "dd/MM/yyyy")}</Badge>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Gestão de Frota</h1>
          <p className="page-subtitle">Gerir veículos e documentação</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Novo Veículo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Adicionar Veículo</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Matrícula *</Label><Input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Marca</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
                <div className="space-y-2"><Label>Modelo</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
                <div className="space-y-2"><Label>VIN</Label><Input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} /></div>
                <div className="space-y-2"><Label>Seguro Expira</Label><Input type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} /></div>
                <div className="space-y-2"><Label>Inspeção Expira</Label><Input type="date" value={form.inspection_expiry} onChange={(e) => setForm({ ...form, inspection_expiry: e.target.value })} /></div>
                <div className="col-span-2 space-y-2"><Label>Calibração Tacógrafo</Label><Input type="date" value={form.tachograph_calibration_date} onChange={(e) => setForm({ ...form, tachograph_calibration_date: e.target.value })} /></div>
              </div>
              <Button type="submit" className="w-full">Adicionar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matrícula</TableHead>
                <TableHead>Marca/Modelo</TableHead>
                <TableHead>Seguro</TableHead>
                <TableHead>Inspeção</TableHead>
                <TableHead>Tacógrafo</TableHead>
                <TableHead>Combustível</TableHead>
                <TableHead>Km</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">A carregar...</TableCell></TableRow>
              ) : vehicles.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum veículo encontrado</TableCell></TableRow>
              ) : (
                vehicles.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono font-semibold">{v.plate}</TableCell>
                    <TableCell>{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</TableCell>
                    <TableCell>{expiryBadge(v.insurance_expiry)}</TableCell>
                    <TableCell>{expiryBadge(v.inspection_expiry)}</TableCell>
                    <TableCell>{expiryBadge(v.tachograph_calibration_date)}</TableCell>
                    <TableCell>{v.fuel_level_percent != null ? `${v.fuel_level_percent}%` : "—"}</TableCell>
                    <TableCell>{v.odometer_km != null ? `${v.odometer_km.toLocaleString()} km` : "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
