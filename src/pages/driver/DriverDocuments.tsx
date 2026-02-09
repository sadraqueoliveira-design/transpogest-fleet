import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VehicleDoc {
  id: string;
  name: string;
  doc_type: string;
  file_url: string;
  created_at: string;
}

const docTypeLabels: Record<string, string> = {
  insurance: "Seguro",
  inspection: "Inspeção",
  registration: "Registo",
  tachograph: "Tacógrafo",
  other: "Outro",
};

export default function DriverDocuments() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<VehicleDoc[]>([]);
  const [vehiclePlate, setVehiclePlate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchDocs = async () => {
      const { data: vehicle } = await supabase
        .from("vehicles")
        .select("id, plate")
        .eq("current_driver_id", user.id)
        .maybeSingle();

      if (!vehicle) {
        setLoading(false);
        return;
      }

      setVehiclePlate(vehicle.plate);

      const { data } = await supabase
        .from("vehicle_documents")
        .select("*")
        .eq("vehicle_id", vehicle.id)
        .order("created_at", { ascending: false });

      if (data) setDocs(data as VehicleDoc[]);
      setLoading(false);
    };
    fetchDocs();
  }, [user]);

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        Documentos
      </h1>
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
                    <Badge variant="secondary" className="text-xs mt-1">
                      {docTypeLabels[doc.doc_type] || doc.doc_type}
                    </Badge>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-3 w-3" />Abrir
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
