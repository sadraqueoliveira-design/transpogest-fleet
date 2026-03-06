import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Upload, Download, FileSpreadsheet, Check, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { format, parse, isValid } from "date-fns";

// Category mapping: DB value → Excel column header
const CATEGORY_COLUMNS = [
  { dbKey: "Revisão KM", header: "Rev. KM Data", headerKm: "Rev. KM (km)", hasKm: true },
  { dbKey: "Revisão Anual", header: "Rev. Anual" },
  { dbKey: "IPO", header: "IPO" },
  { dbKey: "Revisão Frio", header: "Rev. Frio" },
  { dbKey: "Revisão Horas", header: "Rev. Horas (h)", hasHours: true },
  { dbKey: "Tacógrafo", header: "Tacógrafo" },
  { dbKey: "ATP", header: "ATP" },
  { dbKey: "Lavagem", header: "Última Lavagem", isLavagem: true },
] as const;

type ScheduleRow = {
  id: string;
  vehicle_id: string;
  category: string;
  next_due_date: string | null;
  next_due_km: number | null;
  next_due_hours: number | null;
  last_service_date: string | null;
  last_service_km: number | null;
};

type Vehicle = {
  id: string;
  plate: string;
  odometer_km: number | null;
  engine_hours: number | null;
};

// --- EXPORT ---

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  scheduleLookup: Record<string, Record<string, ScheduleRow>>;
}

function formatDateForExcel(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
}

export function ScheduleExportDialog({ open, onClose, vehicles, scheduleLookup }: ExportDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(CATEGORY_COLUMNS.map(c => c.dbKey)));

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(CATEGORY_COLUMNS.map(c => c.dbKey)));
  const selectNone = () => setSelected(new Set());

  const handleExport = (format: "xlsx" | "csv") => {
    const activeCols = CATEGORY_COLUMNS.filter(c => selected.has(c.dbKey));
    if (activeCols.length === 0) { toast.error("Selecione pelo menos uma categoria"); return; }

    const vehiclesWithData = vehicles.filter(v => scheduleLookup[v.id]);
    const rows = vehiclesWithData.map(v => {
      const row: Record<string, any> = { "Matrícula": v.plate };
      activeCols.forEach(col => {
        const schedule = scheduleLookup[v.id]?.[col.dbKey];
        if (col.isLavagem) {
          row[col.header] = formatDateForExcel(schedule?.last_service_date ?? null);
        } else if (col.hasHours) {
          row[col.header] = schedule?.next_due_hours ?? "";
        } else {
          row[col.header] = formatDateForExcel(schedule?.next_due_date ?? null);
        }
        if (col.hasKm) {
          row[col.headerKm!] = schedule?.next_due_km ?? "";
        }
      });
      return row;
    });

    if (rows.length === 0) { toast.error("Sem dados para exportar"); return; }

    if (format === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(rows);
      // Set column widths
      ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 16 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Manutenção");
      XLSX.writeFile(wb, "manutencao_planeamento.xlsx");
    } else {
      const header = Object.keys(rows[0]).join(";");
      const csvRows = rows.map(r => Object.values(r).map(v => v ?? "").join(";"));
      const blob = new Blob([header + "\n" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "manutencao_planeamento.csv"; a.click();
      URL.revokeObjectURL(url);
    }
    toast.success("Exportado com sucesso");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" /> Exportar Planeamento
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Selecione as categorias a exportar:</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>Todas</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectNone}>Nenhuma</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORY_COLUMNS.map(col => (
              <label key={col.dbKey} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-md hover:bg-muted/50 transition-colors">
                <Checkbox
                  checked={selected.has(col.dbKey)}
                  onCheckedChange={() => toggle(col.dbKey)}
                />
                {col.header.replace(" (h)", "").replace(" Data", "")}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="outline" onClick={() => handleExport("csv")} className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4" /> CSV
          </Button>
          <Button onClick={() => handleExport("xlsx")} className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4" /> XLSX
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- IMPORT ---

// Try to parse date in various formats
function parseFlexibleDate(value: any): string | null {
  if (!value) return null;
  
  // If it's a number (Excel serial date)
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }

  const str = String(value).trim();
  if (!str || str === "—" || str.includes("***")) return null;

  // Try DD/MM/YYYY or DD/MM/YY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const year = y.length === 2 ? (parseInt(y) > 50 ? 1900 + parseInt(y) : 2000 + parseInt(y)) : parseInt(y);
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Try M/D/YYYY or M/D/YY (US format)
  const mdyMatch = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (mdyMatch) {
    // Already matched above; this is ambiguous. We'll try ISO as fallback.
  }

  // Try YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // Try native Date parsing as last resort
  const d = new Date(str);
  if (isValid(d)) return format(d, "yyyy-MM-dd");

  return null;
}

interface ImportPreviewRow {
  plate: string;
  vehicleId: string | null;
  categories: Record<string, { date?: string | null; km?: number | null; hours?: number | null }>;
  hasMatch: boolean;
}

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  scheduleLookup: Record<string, Record<string, ScheduleRow>>;
  onImported: () => void;
}

export function ScheduleImportDialog({ open, onClose, vehicles, scheduleLookup, onImported }: ImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [detectedCategories, setDetectedCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<"update" | "replace">("update");
  const [step, setStep] = useState<"upload" | "configure" | "preview">("upload");

  const vehicleMap: Record<string, string> = {};
  vehicles.forEach(v => {
    vehicleMap[v.plate.replace(/[\s\-]/g, "").toUpperCase()] = v.id;
  });

  const resetState = () => {
    setPreviewRows([]);
    setDetectedCategories([]);
    setSelectedCategories(new Set());
    setStep("upload");
    setImportMode("update");
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let rawRows: any[][] = [];

      if (ext === "csv") {
        const text = await file.text();
        rawRows = text.split(/\r?\n/).map(l => l.split(/[;,]/));
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: false });
        rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true }) as any[][];
      }

      if (rawRows.length < 2) { toast.error("Ficheiro vazio ou sem dados"); return; }

      const headers = rawRows[0].map((h: any) => String(h ?? "").trim().toLowerCase());
      
      // Find the plate column
      const plateIdx = headers.findIndex((h: string) => 
        ["matrícula", "matricula", "plate", "viatura", "veículo", "veiculo"].includes(h)
      );
      if (plateIdx === -1) { toast.error("Coluna 'Matrícula' não encontrada"); return; }

      // Map headers to categories
      const headerCategoryMap: Record<number, { dbKey: string; type: "date" | "km" | "hours" }> = {};
      const detected: string[] = [];

      headers.forEach((h: string, idx: number) => {
        if (idx === plateIdx) return;
        for (const col of CATEGORY_COLUMNS) {
          const normalH = h.replace(/[.\s]+/g, " ").trim();
          const colLabel = col.header.toLowerCase().replace(/[.\s]+/g, " ").trim();
          const colShort = col.dbKey.toLowerCase();
          
          if (normalH === colLabel || normalH.includes(colLabel) || normalH === colShort) {
            headerCategoryMap[idx] = { dbKey: col.dbKey, type: col.isLavagem ? "date" : col.hasHours ? "hours" : "date" };
            if (!detected.includes(col.dbKey)) detected.push(col.dbKey);
          }
          // Check for KM column
          if (col.hasKm && col.headerKm) {
            const kmLabel = col.headerKm.toLowerCase().replace(/[.\s]+/g, " ").trim();
            if (normalH === kmLabel || normalH.includes("km")) {
              if (normalH.includes("rev") || normalH.includes("km")) {
                headerCategoryMap[idx] = { dbKey: col.dbKey, type: "km" };
                if (!detected.includes(col.dbKey)) detected.push(col.dbKey);
              }
            }
          }
          // Check for hours
          if (col.hasHours) {
            if (normalH.includes("hora") || normalH.includes("hours")) {
              headerCategoryMap[idx] = { dbKey: col.dbKey, type: "hours" };
              if (!detected.includes(col.dbKey)) detected.push(col.dbKey);
            }
          }
        }
      });

      if (detected.length === 0) { toast.error("Nenhuma coluna de manutenção reconhecida. Certifique-se de que os cabeçalhos correspondem."); return; }

      // Parse data rows
      const parsed: ImportPreviewRow[] = [];
      for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        const plateRaw = String(row[plateIdx] ?? "").trim();
        if (!plateRaw) continue;

        const normalPlate = plateRaw.replace(/[\s\-]/g, "").toUpperCase();
        const vehicleId = vehicleMap[normalPlate] || null;

        const categories: ImportPreviewRow["categories"] = {};
        
        for (const [idxStr, mapping] of Object.entries(headerCategoryMap)) {
          const cellVal = row[parseInt(idxStr)];
          if (!categories[mapping.dbKey]) categories[mapping.dbKey] = {};
          
          if (mapping.type === "km") {
            const km = typeof cellVal === "number" ? cellVal : parseInt(String(cellVal ?? "").replace(/[.,\s]/g, ""));
            if (!isNaN(km) && km > 0) categories[mapping.dbKey].km = km;
          } else if (mapping.type === "hours") {
            const hours = typeof cellVal === "number" ? cellVal : parseInt(String(cellVal ?? "").replace(/[.,\s]/g, ""));
            if (!isNaN(hours) && hours > 0) categories[mapping.dbKey].hours = hours;
          } else {
            categories[mapping.dbKey].date = parseFlexibleDate(cellVal);
          }
        }

        if (Object.keys(categories).length > 0) {
          parsed.push({
            plate: plateRaw,
            vehicleId,
            categories,
            hasMatch: !!vehicleId,
          });
        }
      }

      if (parsed.length === 0) { toast.error("Nenhum dado válido encontrado"); return; }

      setPreviewRows(parsed);
      setDetectedCategories(detected);
      setSelectedCategories(new Set(detected));
      setStep("configure");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao ler o ficheiro");
    }
  };

  const toggleCategory = (key: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const matchedRows = previewRows.filter(r => r.hasMatch);
  const unmatchedRows = previewRows.filter(r => !r.hasMatch);

  const handleImport = async () => {
    if (selectedCategories.size === 0) { toast.error("Selecione categorias"); return; }
    setImporting(true);

    try {
      const validRows = previewRows.filter(r => r.hasMatch && r.vehicleId);
      
      for (const cat of selectedCategories) {
        const colDef = CATEGORY_COLUMNS.find(c => c.dbKey === cat);
        if (!colDef) continue;

        for (const row of validRows) {
          const catData = row.categories[cat];
          if (!catData) continue;

          const existing = scheduleLookup[row.vehicleId!]?.[cat];

          if (existing) {
            // Update existing
            const updates: Record<string, any> = {};
            if (colDef.isLavagem && catData.date) {
              updates.last_service_date = catData.date;
            } else if (colDef.hasHours && catData.hours) {
              updates.next_due_hours = catData.hours;
            } else if (catData.date) {
              updates.next_due_date = catData.date;
            }
            if (colDef.hasKm && catData.km) {
              updates.next_due_km = catData.km;
            }

            if (Object.keys(updates).length > 0) {
              await supabase
                .from("vehicle_maintenance_schedule")
                .update(updates)
                .eq("id", existing.id);
            }
          } else {
            // Insert new
            const insert: Record<string, any> = {
              vehicle_id: row.vehicleId,
              category: cat,
            };
            if (colDef.isLavagem) {
              insert.last_service_date = catData.date || null;
            } else if (colDef.hasHours) {
              insert.next_due_hours = catData.hours || null;
            } else {
              insert.next_due_date = catData.date || null;
            }
            if (colDef.hasKm) {
              insert.next_due_km = catData.km || null;
            }

            await supabase
              .from("vehicle_maintenance_schedule")
              .insert(insert);
          }
        }

        // Sync IPO and Tacógrafo to vehicles table
        if (cat === "IPO" || cat === "Tacógrafo") {
          for (const row of validRows) {
            const catData = row.categories[cat];
            if (!catData?.date) continue;
            const field = cat === "IPO" ? "inspection_expiry" : "tachograph_calibration_date";
            await supabase
              .from("vehicles")
              .update({ [field]: catData.date })
              .eq("id", row.vehicleId!);
          }
        }
      }

      toast.success(`${validRows.length} veículos atualizados em ${selectedCategories.size} categorias`);
      onImported();
      onClose();
      resetState();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao importar: " + (err.message || "Desconhecido"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.xlsm" className="hidden" onChange={handleFile} />
      
      <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); resetState(); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> Importar Planeamento
            </DialogTitle>
          </DialogHeader>

          {step === "upload" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="rounded-xl border-2 border-dashed border-muted-foreground/25 p-8 text-center">
                <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-4">
                  Selecione um ficheiro Excel (.xlsx, .xlsm) ou CSV com as colunas de manutenção.
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  O ficheiro deve conter uma coluna "Matrícula" e pelo menos uma coluna de manutenção
                  (Rev. KM, IPO, Tacógrafo, etc.)
                </p>
                <Button onClick={() => fileRef.current?.click()} className="gap-2">
                  <Upload className="h-4 w-4" /> Selecionar Ficheiro
                </Button>
              </div>
            </div>
          )}

          {step === "configure" && (
            <div className="space-y-4 flex-1 overflow-auto">
              {/* Stats */}
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary" className="gap-1">
                  <Check className="h-3 w-3" /> {matchedRows.length} veículos encontrados
                </Badge>
                {unmatchedRows.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> {unmatchedRows.length} sem correspondência
                  </Badge>
                )}
                <Badge variant="outline">{detectedCategories.length} categorias detetadas</Badge>
              </div>

              {/* Category selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Categorias a importar:</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {detectedCategories.map(cat => (
                    <label key={cat} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-md border hover:bg-muted/50 transition-colors">
                      <Checkbox
                        checked={selectedCategories.has(cat)}
                        onCheckedChange={() => toggleCategory(cat)}
                      />
                      {cat}
                    </label>
                  ))}
                </div>
              </div>

              {/* Import mode */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Modo de importação:</Label>
                <RadioGroup value={importMode} onValueChange={(v) => setImportMode(v as "update" | "replace")}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="update" id="mode-update" />
                    <Label htmlFor="mode-update" className="text-sm cursor-pointer">
                      Atualizar existentes e criar novos
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Unmatched plates warning */}
              {unmatchedRows.length > 0 && (
                <div className="rounded-md bg-destructive/5 border border-destructive/20 p-3">
                  <p className="text-sm font-medium text-destructive flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="h-4 w-4" /> Matrículas não encontradas (serão ignoradas):
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {unmatchedRows.map(r => r.plate).join(", ")}
                  </p>
                </div>
              )}

              {/* Preview table */}
              <div className="border rounded-md overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10 w-8"></TableHead>
                      <TableHead className="sticky left-8 bg-background z-10">Matrícula</TableHead>
                      {[...selectedCategories].map(cat => (
                        <TableHead key={cat} className="text-center text-xs">{cat}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.slice(0, 50).map((row, i) => (
                      <TableRow key={i} className={!row.hasMatch ? "bg-destructive/5 opacity-60" : ""}>
                        <TableCell className="sticky left-0 bg-background z-10">
                          {row.hasMatch ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-destructive" />}
                        </TableCell>
                        <TableCell className="sticky left-8 bg-background z-10 font-mono text-sm">{row.plate}</TableCell>
                        {[...selectedCategories].map(cat => {
                          const data = row.categories[cat];
                          const colDef = CATEGORY_COLUMNS.find(c => c.dbKey === cat);
                          let display = "—";
                          if (data) {
                            if (colDef?.hasHours && data.hours) display = `${data.hours}h`;
                            else if (data.date) {
                              try { display = format(new Date(data.date), "dd/MM/yy"); } catch { display = data.date; }
                            }
                            if (colDef?.hasKm && data.km) display += ` | ${(data.km / 1000).toFixed(0)}k km`;
                          }
                          return <TableCell key={cat} className="text-center text-xs">{display}</TableCell>;
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {previewRows.length > 50 && (
                <p className="text-xs text-muted-foreground text-center">
                  A mostrar 50 de {previewRows.length} registos
                </p>
              )}
            </div>
          )}

          {step !== "upload" && (
            <DialogFooter className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => { onClose(); resetState(); }}>Cancelar</Button>
              <Button
                onClick={handleImport}
                disabled={importing || matchedRows.length === 0 || selectedCategories.size === 0}
                className="gap-1.5"
              >
                {importing ? "A importar..." : `Importar ${matchedRows.length} veículos`}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
