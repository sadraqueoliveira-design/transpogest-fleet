import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, AlertTriangle, Check, X } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import * as XLSX from "xlsx";

interface ImportRow {
  card_number: string;
  driver_name: string;
  expiry_date: string;
  valid: boolean;
  error?: string;
}

interface TachographImportProps {
  onImportComplete: () => void;
}

const DATE_FORMATS = ["dd/MM/yyyy", "yyyy-MM-dd", "MM/dd/yyyy", "dd-MM-yyyy"];

function parseDate(value: string): string | null {
  if (!value) return null;
  for (const fmt of DATE_FORMATS) {
    const d = parse(value.trim(), fmt, new Date());
    if (isValid(d)) return format(d, "yyyy-MM-dd");
  }
  return null;
}

function normalizeHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const aliases: Record<string, string[]> = {
    card_number: ["card_number", "numero", "número", "numero do cartao", "número do cartão", "cartao", "cartão", "card", "nº cartão", "nº cartao", "n cartao"],
    driver_name: ["driver_name", "motorista", "nome", "nome do motorista", "driver", "name", "condutor"],
    expiry_date: ["expiry_date", "validade", "data de validade", "expiry", "data validade", "vencimento", "data_validade"],
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

function parseRows(raw: string[][], headerMap: Record<string, number>): ImportRow[] {
  const cardIdx = headerMap.card_number;
  if (cardIdx === undefined) return [];

  return raw.map(row => {
    const card_number = (row[cardIdx] || "").toString().trim();
    const driver_name = headerMap.driver_name !== undefined ? (row[headerMap.driver_name] || "").toString().trim() : "";
    const rawDate = headerMap.expiry_date !== undefined ? (row[headerMap.expiry_date] || "").toString().trim() : "";
    const expiry_date = parseDate(rawDate);

    const valid = card_number.length > 0;
    const error = !valid ? "Número do cartão em falta" : rawDate && !expiry_date ? "Data inválida" : undefined;

    return {
      card_number,
      driver_name,
      expiry_date: expiry_date || "",
      valid: valid && !error,
      error,
    };
  }).filter(r => r.card_number.length > 0 || r.driver_name.length > 0);
}

export default function TachographImport({ onImportComplete }: TachographImportProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validCount = rows.filter(r => r.valid).length;
  const invalidCount = rows.filter(r => !r.valid).length;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "csv") {
        const text = await file.text();
        const lines = text.split(/\r?\n/).map(l => l.split(/[;,]/));
        if (lines.length < 2) { toast.error("Ficheiro vazio"); return; }
        const headerMap = normalizeHeaders(lines[0]);
        if (headerMap.card_number === undefined) {
          toast.error("Coluna 'Número do Cartão' não encontrada");
          return;
        }
        setRows(parseRows(lines.slice(1), headerMap));
      } else if (ext === "xlsx" || ext === "xls") {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length < 2) { toast.error("Ficheiro vazio"); return; }
        const headerMap = normalizeHeaders(data[0].map(String));
        if (headerMap.card_number === undefined) {
          toast.error("Coluna 'Número do Cartão' não encontrada");
          return;
        }
        setRows(parseRows(data.slice(1), headerMap));
      } else {
        toast.error("Formato não suportado. Use CSV ou XLSX.");
        return;
      }

      setOpen(true);
    } catch {
      toast.error("Erro ao ler ficheiro");
    }

    if (fileRef.current) fileRef.current.value = "";
  };

  const handleImport = async () => {
    const toImport = rows.filter(r => r.valid);
    if (toImport.length === 0) return;

    setImporting(true);
    const payload = toImport.map(r => ({
      card_number: r.card_number,
      driver_name: r.driver_name || null,
      expiry_date: r.expiry_date || null,
    }));

    const { error } = await supabase.from("tachograph_cards").upsert(payload, {
      onConflict: "card_number",
    });

    setImporting(false);

    if (error) {
      toast.error("Erro na importação: " + error.message);
    } else {
      toast.success(`${toImport.length} cartão(ões) importado(s)`);
      setOpen(false);
      setRows([]);
      onImportComplete();
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
      <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2">
        <Upload className="h-4 w-4" /> Importar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" /> Pré-visualização da Importação
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-3 text-sm">
            <Badge variant="secondary" className="gap-1">
              <Check className="h-3 w-3" /> {validCount} válidos
            </Badge>
            {invalidCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> {invalidCount} com erros
              </Badge>
            )}
          </div>

          <div className="overflow-auto flex-1 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Nº Cartão</TableHead>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Validade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i} className={!r.valid ? "bg-destructive/5" : ""}>
                    <TableCell>
                      {r.valid ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-destructive" />}
                    </TableCell>
                    <TableCell className="font-mono">{r.card_number || "—"}</TableCell>
                    <TableCell>{r.driver_name || "—"}</TableCell>
                    <TableCell>
                      {r.expiry_date || (r.error ? <span className="text-xs text-destructive">{r.error}</span> : "—")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleImport} disabled={importing || validCount === 0}>
              {importing ? "A importar..." : `Importar ${validCount} cartão(ões)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
