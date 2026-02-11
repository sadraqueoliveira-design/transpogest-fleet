import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface Declaration {
  id: string;
  status: string;
  gap_start_date: string;
  gap_end_date: string;
  reason_code: string | null;
  reason_text: string | null;
  company_name: string;
  created_at: string;
}

const REASON_LABELS: Record<string, string> = {
  sick_leave: "Baixa por doença ou lesão",
  vacation: "Férias anuais",
  rest: "Licença ou período de repouso",
  exempt_vehicle: "Condução de veículo isento (Art.º 3)",
  other_work: "Trabalho não relacionado com condução",
  other: "Disponível",
};

export default function DriverDeclarations() {
  const { user } = useAuth();
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Declaration | null>(null);
  const [reasonCode, setReasonCode] = useState("vacation");
  const [reasonText, setReasonText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchDeclarations = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("activity_declarations")
      .select("*")
      .eq("driver_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
    } else {
      setDeclarations(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDeclarations();
  }, [user]);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);

    const { error } = await supabase
      .from("activity_declarations")
      .update({
        reason_code: reasonCode as any,
        reason_text: reasonText || null,
      })
      .eq("id", selected.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Justificação enviada com sucesso!");
      setSelected(null);
      fetchDeclarations();
    }
    setSubmitting(false);
  };

  const formatDate = (d: string) => format(new Date(d), "dd/MM/yyyy HH:mm", { locale: pt });
  const gapHours = (start: string, end: string) => {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return Math.round(ms / (1000 * 60 * 60));
  };

  const pendingDeclarations = declarations.filter((d) => d.status === "draft");
  const otherDeclarations = declarations.filter((d) => d.status !== "draft");

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold">Declarações de Atividade</h1>
        <p className="text-sm text-muted-foreground">Justifique as suas ausências de tacógrafo</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : declarations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-primary mb-2" />
            <p className="text-muted-foreground">Sem declarações pendentes. Tudo em ordem!</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {pendingDeclarations.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-destructive flex items-center gap-1">
                <Clock className="h-4 w-4" /> Pendentes ({pendingDeclarations.length})
              </h2>
              {pendingDeclarations.map((d) => (
                <Card key={d.id} className="border-destructive/30">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="destructive">Pendente</Badge>
                      <span className="text-xs text-muted-foreground">{gapHours(d.gap_start_date, d.gap_end_date)}h sem cartão</span>
                    </div>
                    <div className="text-sm space-y-1">
                      <p><span className="text-muted-foreground">De:</span> {formatDate(d.gap_start_date)}</p>
                      <p><span className="text-muted-foreground">Até:</span> {formatDate(d.gap_end_date)}</p>
                    </div>
                    <Button
                      className="w-full mt-2"
                      size="lg"
                      onClick={() => {
                        setSelected(d);
                        setReasonCode("vacation");
                        setReasonText("");
                      }}
                    >
                      <FileText className="h-4 w-4 mr-2" /> Justificar Ausência
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {otherDeclarations.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Anteriores</h2>
              {otherDeclarations.map((d) => (
                <Card key={d.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <Badge variant={d.status === "signed" ? "default" : "secondary"}>
                        {d.status === "signed" ? "Assinada" : "Arquivada"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(d.created_at)}</span>
                    </div>
                    <div className="text-sm mt-2 space-y-1">
                      <p><span className="text-muted-foreground">Período:</span> {formatDate(d.gap_start_date)} — {formatDate(d.gap_end_date)}</p>
                      {d.reason_code && (
                        <p><span className="text-muted-foreground">Motivo:</span> {REASON_LABELS[d.reason_code] || d.reason_code}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Justification modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Justificar Ausência</DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <p><strong>De:</strong> {formatDate(selected.gap_start_date)}</p>
                <p><strong>Até:</strong> {formatDate(selected.gap_end_date)}</p>
                <p><strong>Duração:</strong> {gapHours(selected.gap_start_date, selected.gap_end_date)} horas</p>
              </div>

              <div className="space-y-3">
                <Label className="font-semibold">Qual foi o motivo?</Label>
                <RadioGroup value={reasonCode} onValueChange={setReasonCode}>
                  {Object.entries(REASON_LABELS).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <RadioGroupItem value={k} id={`driver-${k}`} />
                      <Label htmlFor={`driver-${k}`} className="text-sm cursor-pointer">{v}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {reasonCode === "other" && (
                <div>
                  <Label>Observações</Label>
                  <Textarea
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    placeholder="Descreva o motivo..."
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={submitting} size="lg">
              {submitting ? "A enviar..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
