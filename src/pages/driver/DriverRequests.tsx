import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function DriverRequests() {
  const { user } = useAuth();
  const [type, setType] = useState<string>("Uniform");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("service_requests").insert({
      driver_id: user?.id,
      type: type as any,
      details,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Pedido enviado com sucesso!");
      setDetails({});
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold">Solicitações</h1>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Pedido</Label>
              <Select value={type} onValueChange={(v) => { setType(v); setDetails({}); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Uniform">Fardamento</SelectItem>
                  <SelectItem value="Vacation">Férias</SelectItem>
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

            {type === "Vacation" && (
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

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={details.notes || ""} onChange={(e) => setDetails({ ...details, notes: e.target.value })} placeholder="Detalhes adicionais..." rows={3} />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "A enviar..." : "Enviar Pedido"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
