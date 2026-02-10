import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Fuel, Camera, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function FuelLog() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [form, setForm] = useState({
    vehicle_id: "",
    fuel_type: "Diesel" as string,
    liters: "",
    price_per_liter: "",
    odometer_at_fillup: "",
    reefer_engine_hours: "",
    payment_method: "fleet_card",
  });
  const [loading, setLoading] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from("vehicles").select("id, plate").eq("current_driver_id", user?.id || "").then(({ data }) => {
      if (data && data.length > 0) {
        setVehicles(data);
        setForm((f) => ({ ...f, vehicle_id: data[0].id }));
      }
    });
  }, [user]);

  const uploadReceipt = async (): Promise<string | null> => {
    if (!receiptFile || !user) return null;
    const ext = receiptFile.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("fuel-receipts").upload(path, receiptFile);
    if (error) {
      toast.error("Erro ao enviar recibo: " + error.message);
      return null;
    }
    const { data } = supabase.storage.from("fuel-receipts").getPublicUrl(path);
    return data.publicUrl;
  };

  const requiresReceipt = form.payment_method === "cash" || form.payment_method === "credit_card";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requiresReceipt && !receiptFile) {
      toast.error("Recibo obrigatório para este método de pagamento.");
      return;
    }
    setLoading(true);
    const receiptUrl = await uploadReceipt();
    const { error } = await supabase.from("fuel_logs").insert({
      vehicle_id: form.vehicle_id,
      driver_id: user?.id,
      fuel_type: form.fuel_type as any,
      liters: parseFloat(form.liters),
      price_per_liter: form.price_per_liter ? parseFloat(form.price_per_liter) : null,
      odometer_at_fillup: form.odometer_at_fillup ? parseFloat(form.odometer_at_fillup) : null,
      reefer_engine_hours: form.fuel_type === "Reefer_Diesel" && form.reefer_engine_hours ? parseFloat(form.reefer_engine_hours) : null,
      receipt_photo_url: receiptUrl,
      payment_method: form.payment_method,
    } as any);
    if (error) toast.error(error.message);
    else {
      toast.success("Abastecimento registado!");
      setForm({ ...form, liters: "", price_per_liter: "", odometer_at_fillup: "", reefer_engine_hours: "" });
      setReceiptFile(null);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold flex items-center gap-2"><Fuel className="h-5 w-5 text-primary" />Abastecer</h1>

      <Alert variant="default" className="border-warning/50 bg-warning/10">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <AlertDescription className="text-xs text-warning">
          Insira os litros exatos indicados na bomba para validação automática.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {vehicles.length > 0 && (
              <div className="space-y-2">
                <Label>Veículo</Label>
                <Select value={form.vehicle_id} onValueChange={(v) => setForm({ ...form, vehicle_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Tipo de Combustível</Label>
              <Select value={form.fuel_type} onValueChange={(v) => setForm({ ...form, fuel_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Diesel">Diesel</SelectItem>
                  <SelectItem value="AdBlue">AdBlue</SelectItem>
                  <SelectItem value="Reefer_Diesel">Thermo King (Reefer)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Método de Pagamento</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fleet_card">Cartão Frota/Contrato</SelectItem>
                  <SelectItem value="credit_card">Cartão Crédito</SelectItem>
                  <SelectItem value="cash">Numerário</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Litros (Bomba) *</Label>
                <Input type="number" step="0.01" value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} required placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Preço/Litro (€)</Label>
                <Input type="number" step="0.001" value={form.price_per_liter} onChange={(e) => setForm({ ...form, price_per_liter: e.target.value })} placeholder="0.000" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Quilometragem *</Label>
              <Input type="number" value={form.odometer_at_fillup} onChange={(e) => setForm({ ...form, odometer_at_fillup: e.target.value })} required placeholder="km" />
            </div>

            {form.fuel_type === "Reefer_Diesel" && (
              <div className="space-y-2">
                <Label>Horímetro (Horas Motor) *</Label>
                <Input type="number" step="0.1" value={form.reefer_engine_hours} onChange={(e) => setForm({ ...form, reefer_engine_hours: e.target.value })} required placeholder="Horas" />
              </div>
            )}

            {/* Receipt photo upload - only for non-fleet-card payments */}
            {requiresReceipt && (
              <div className="space-y-2">
                <Label>Foto do Recibo *</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                />
                <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="mr-2 h-4 w-4" />
                  {receiptFile ? receiptFile.name : "Tirar Foto / Anexar Recibo"}
                </Button>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading || !form.vehicle_id}>
              {loading ? "A registar..." : "Registar Abastecimento"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
