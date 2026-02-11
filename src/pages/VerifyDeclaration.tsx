import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Search, AlertTriangle, MapPin, Monitor, Clock } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { useSearchParams } from "react-router-dom";

interface AuditRecord {
  verification_id: string;
  declaration_id: string;
  signer_role: string;
  signer_name: string;
  signed_at: string;
  gps_lat: number | null;
  gps_lng: number | null;
  device_info: string | null;
  ip_address: string | null;
  signature_url: string | null;
  pdf_url: string | null;
}

export default function VerifyDeclaration() {
  const [searchParams] = useSearchParams();
  const [verificationId, setVerificationId] = useState(searchParams.get("id") || "");
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (searchParams.get("id")) {
      handleSearch(searchParams.get("id")!);
    }
  }, []);

  const handleSearch = async (id?: string) => {
    const searchId = id || verificationId.trim();
    if (!searchId) return;
    setLoading(true);
    setSearched(true);

    const { data, error } = await supabase
      .from("signature_audit_logs" as any)
      .select("*")
      .eq("verification_id", searchId);

    if (error) {
      console.error(error);
      setRecords([]);
    } else {
      setRecords((data as any) || []);
    }
    setLoading(false);
  };

  const formatDT = (d: string) => {
    try {
      return format(new Date(d), "dd/MM/yyyy 'às' HH:mm:ss", { locale: pt });
    } catch {
      return d;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mx-auto">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Verificação de Documento</h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Introduza o ID de Verificação presente no rodapé do documento para confirmar a sua autenticidade.
          </p>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-4">
            <form
              onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
              className="flex gap-2"
            >
              <Input
                placeholder="ID de Verificação (ex: a1b2c3d4e5f6)"
                value={verificationId}
                onChange={(e) => setVerificationId(e.target.value)}
                className="font-mono"
              />
              <Button type="submit" disabled={loading || !verificationId.trim()}>
                <Search className="h-4 w-4 mr-1" />
                {loading ? "A verificar..." : "Verificar"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Results */}
        {searched && !loading && records.length === 0 && (
          <Card className="border-destructive/30">
            <CardContent className="p-6 text-center space-y-2">
              <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
              <p className="font-semibold text-destructive">Documento não encontrado</p>
              <p className="text-sm text-muted-foreground">
                Não foi possível localizar nenhum documento com este ID de verificação.
                Verifique se o código está correto.
              </p>
            </CardContent>
          </Card>
        )}

        {records.length > 0 && (
          <div className="space-y-4">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-6 text-center space-y-2">
                <ShieldCheck className="h-10 w-10 text-primary mx-auto" />
                <p className="font-semibold text-primary">Documento Verificado</p>
                <p className="text-sm text-muted-foreground">
                  Este documento é original e foi assinado digitalmente via TranspoGest.
                </p>
              </CardContent>
            </Card>

            {records.map((r, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    Assinatura {r.signer_role === "driver" ? "do Motorista" : "do Gestor"}
                    <Badge variant={r.signer_role === "driver" ? "secondary" : "default"}>
                      {r.signer_role === "driver" ? "Motorista" : "Gestor"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Assinado por</p>
                        <p className="font-medium">{r.signer_name}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Data/Hora</p>
                        <p className="font-medium">{formatDT(r.signed_at)}</p>
                      </div>
                    </div>
                    {r.gps_lat && r.gps_lng && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Coordenadas GPS</p>
                          <p className="font-mono text-xs">{r.gps_lat.toFixed(6)}, {r.gps_lng.toFixed(6)}</p>
                        </div>
                      </div>
                    )}
                    {r.ip_address && (
                      <div className="flex items-start gap-2">
                        <Monitor className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Endereço IP</p>
                          <p className="font-mono text-xs">{r.ip_address}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {r.device_info && (
                    <div className="rounded border p-2 bg-muted/50">
                      <p className="text-xs text-muted-foreground">Dispositivo</p>
                      <p className="font-mono text-[10px] break-all">{r.device_info}</p>
                    </div>
                  )}
                  {r.signature_url && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Assinatura Digital</p>
                      <img src={r.signature_url} alt="Assinatura" className="h-12 rounded border bg-white px-3 py-1" />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {records[0]?.pdf_url && (
              <div className="text-center">
                <Button asChild>
                  <a href={records[0].pdf_url} target="_blank" rel="noopener noreferrer">
                    Ver PDF Assinado
                  </a>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          TranspoGest — Sistema de Gestão de Transportes
        </p>
      </div>
    </div>
  );
}
