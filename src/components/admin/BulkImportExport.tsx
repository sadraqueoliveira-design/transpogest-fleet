import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Upload, Download, FileSpreadsheet, Check, X } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// ─── Generic header normalizer ───
export function normalizeHeaders(
  headers: string[],
  aliases: Record<string, string[]>
): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const n = h.toLowerCase().trim().replace(/[_\-]/g, " ");
    for (const [key, variants] of Object.entries(aliases)) {
      if (variants.some(v => n === v || n.includes(v))) {
        if (!(key in map)) map[key] = i;
      }
    }
  });
  return map;
}

// ─── Read file into rows ───
export async function readFileToRows(file: File): Promise<string[][] | null> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    const text = await file.text();
    return text.split(/\r?\n/).map(l => l.split(/[;,]/));
  }
  if (ext === "xlsx" || ext === "xls") {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as string[][];
  }
  toast.error("Formato não suportado. Use CSV ou XLSX.");
  return null;
}

// ─── Export helpers ───
export function exportCSV(data: Record<string, any>[], filename: string) {
  if (data.length === 0) { toast.error("Sem dados para exportar"); return; }
  const header = Object.keys(data[0]).join(";");
  const rows = data.map(r => Object.values(r).map(v => v ?? "").join(";"));
  const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function exportXLSX(data: Record<string, any>[], filename: string, sheetName = "Dados") {
  if (data.length === 0) { toast.error("Sem dados para exportar"); return; }
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export function downloadTemplate(header: string, example: string, filename: string) {
  const blob = new Blob([header + "\n" + example], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Export dropdown component ───
interface ExportButtonProps {
  data: Record<string, any>[];
  filenameBase: string;
  sheetName?: string;
}

export function ExportButton({ data, filenameBase, sheetName }: ExportButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileSpreadsheet className="h-4 w-4" /> Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => exportCSV(data, `${filenameBase}.csv`)}>CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportXLSX(data, `${filenameBase}.xlsx`, sheetName)}>XLSX</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Import button + preview dialog ───
export interface ImportRow {
  data: Record<string, string>;
  valid: boolean;
  error?: string;
}

interface ImportButtonProps {
  columns: string[];
  aliases: Record<string, string[]>;
  requiredColumns: string[];
  validate?: (row: Record<string, string>) => { valid: boolean; error?: string };
  onImport: (rows: Record<string, string>[]) => Promise<void>;
  templateHeader?: string;
  templateExample?: string;
  templateFilename?: string;
}

export function ImportButton({
  columns, aliases, requiredColumns, validate, onImport,
  templateHeader, templateExample, templateFilename
}: ImportButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const lines = await readFileToRows(file);
      if (!lines || lines.length < 2) { toast.error("Ficheiro vazio"); return; }
      const headerMap = normalizeHeaders(lines[0].map(String), aliases);

      const missing = requiredColumns.filter(c => headerMap[c] === undefined);
      if (missing.length > 0) {
        toast.error(`Colunas não encontradas: ${missing.join(", ")}`);
        return;
      }

      const parsed: ImportRow[] = lines.slice(1)
        .map(row => {
          const data: Record<string, string> = {};
          for (const col of columns) {
            data[col] = headerMap[col] !== undefined ? (row[headerMap[col]] || "").toString().trim() : "";
          }
          const validation = validate ? validate(data) : { valid: true };
          return { data, ...validation };
        })
        .filter(r => columns.some(c => r.data[c]?.length > 0));

      setRows(parsed);
      setOpen(true);
    } catch { toast.error("Erro ao ler ficheiro"); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const validCount = rows.filter(r => r.valid).length;

  const handleImport = async () => {
    const valid = rows.filter(r => r.valid).map(r => r.data);
    if (valid.length === 0) return;
    setImporting(true);
    try { await onImport(valid); setOpen(false); setRows([]); }
    catch (err: any) { toast.error("Erro: " + (err.message || "Desconhecido")); }
    setImporting(false);
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
      {templateHeader && templateExample && templateFilename && (
        <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadTemplate(templateHeader!, templateExample!, templateFilename!)}>
          <Download className="h-4 w-4" /> Modelo
        </Button>
      )}
      <Button variant="outline" size="sm" className="gap-2" onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4" /> Importar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" /> Pré-visualização ({validCount} válidos)
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary" className="gap-1"><Check className="h-3 w-3" />{validCount} válidos</Badge>
            {rows.length - validCount > 0 && (
              <Badge variant="destructive" className="gap-1"><X className="h-3 w-3" />{rows.length - validCount} com erros</Badge>
            )}
          </div>
          <div className="overflow-auto flex-1 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  {columns.map(c => <TableHead key={c}>{c}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i} className={!r.valid ? "bg-destructive/5" : ""}>
                    <TableCell>{r.valid ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-destructive" />}</TableCell>
                    {columns.map(c => <TableCell key={c} className="text-sm">{r.data[c] || "—"}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleImport} disabled={importing || validCount === 0}>
              {importing ? "A importar..." : `Importar ${validCount}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
