import jsPDF from "jspdf";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

// Helper to convert "Nome Apelido" to "Apelido, Nome" format
function toSurnameFirst(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  const surname = parts[parts.length - 1];
  const given = parts.slice(0, -1).join(" ");
  return `${surname}, ${given}`;
}

interface DeclarationPDFData {
  driverName: string;
  licenseNumber: string;
  birthDate?: string | null;
  hireDate?: string | null;
  gapStartDate: string;
  gapEndDate: string;
  reasonCode: string;
  reasonText?: string;
  managerName: string;
  managerPosition?: string;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyFax?: string;
  companyEmail?: string;
  signingLocation?: string;
  driverSignatureDataUrl?: string;
  managerSignatureDataUrl?: string;
  signedAt?: string;
  signedIP?: string;
  verificationId?: string;
  _stampDataUrl?: string;
}

interface GenerateOptions {
  /** Pass an existing jsPDF doc to append a new page instead of creating a new document */
  existingDoc?: jsPDF;
}

const REASON_MAP: Record<string, number> = {
  sick_leave: 14,
  vacation: 15,
  rest: 16,
  exempt_vehicle: 17,
  other_work: 18,
  other: 19,
};

export function generateDeclarationPDF(data: DeclarationPDFData, options?: GenerateOptions): jsPDF {
  const doc = options?.existingDoc ?? new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  if (options?.existingDoc) doc.addPage();

  // ── Stamp image (embedded as base64 for reliability) ──
  // Will be loaded and applied at the end of the page rendering
  const stampDataUrl = data._stampDataUrl;
  const W = 210;
  const margin = 20;
  const cw = W - 2 * margin;
  const numCol = 14; // width for the (N) number column
  const textX = margin + numCol; // x position for label+value text

  const LABEL_SIZE = 8;
  const VALUE_SIZE = 10;
  const HEADER_SIZE = 9;

  const formatDT = (d: string) => format(new Date(d), "H:mm'-'dd'-'MM'-'yyyy", { locale: pt });
  const formatD = (d: string) => format(new Date(d), "dd/MM/yyyy", { locale: pt });

  let y = 18;

  // ── Header (outside the border) ──
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  const anexoW = doc.getTextWidth("ANEXO");
  doc.text("ANEXO", W / 2, y, { align: "center" });
  doc.setLineWidth(0.4);
  doc.line(W / 2 - anexoW / 2, y + 0.8, W / 2 + anexoW / 2, y + 0.8);
  y += 7;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("DECLARAÇÃO DE ACTIVIDADE¹", W / 2, y, { align: "center" });
  y += 4.5;
  doc.text("(REGULAMENTO (CE)  Nº561/2006 OU AETR²)", W / 2, y, { align: "center" });
  y += 6;

  doc.setFontSize(7.5);
  const subtext = "Preencher (texto dactilografado) e assinar antes de cada viagem. Conservar juntamente com os registos originais do aparelho de controlo, sempre que necessário.";
  const subLines = doc.splitTextToSize(subtext, cw);
  doc.text(subLines, W / 2, y, { align: "center" });
  y += subLines.length * 3.5 + 1;

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("AS FALSAS DECLARAÇÕES CONSTITUEM UMA INFRACÇÃO", W / 2, y, { align: "center" });
  const falseW = doc.getTextWidth("AS FALSAS DECLARAÇÕES CONSTITUEM UMA INFRACÇÃO");
  doc.setLineWidth(0.3);
  doc.line(W / 2 - falseW / 2, y + 0.8, W / 2 + falseW / 2, y + 0.8);
  y += 5;

  // ── Start bordered form area ──
  const borderTop = y;
  const borderX = margin;
  const borderW = cw;

  y += 4;

  // "Parte a preencher pela empresa"
  doc.setFontSize(HEADER_SIZE);
  doc.setFont("helvetica", "bold");
  doc.text("Parte a preencher pela empresa", margin + 2, y);
  y += 6;

  // Helper: field row — label in small font, value in larger font on same line
  const fieldRow = (num: string, label: string, value: string) => {
    doc.setFontSize(LABEL_SIZE);
    doc.setFont("helvetica", "normal");
    doc.text(`(${num})`, margin + 2, y);

    const labelText = `${label}:`;
    doc.text(labelText, textX, y);
    const labelW = doc.getTextWidth(labelText);

    doc.setFontSize(VALUE_SIZE);
    doc.setFont("helvetica", "normal");

    const valueX = textX + labelW + 1;
    const availW = margin + cw - valueX - 2;
    const valueLines = doc.splitTextToSize(value, availW);
    // First line on same row as label
    if (valueLines.length > 0) {
      doc.text(valueLines[0], valueX, y);
    }
    // Subsequent lines wrap below, aligned to valueX
    for (let i = 1; i < valueLines.length; i++) {
      y += 4.5;
      doc.text(valueLines[i], valueX, y);
    }
    y += 6;
  };

  // Fields 1-5
  fieldRow("1", "Nome da empresa", data.companyName);
  
  // Field 2 - special handling: full text wraps across entire width
  {
    const address = data.companyAddress || "Rua Vale Casal, 42, Edf. Florêncio E Silva. Vale Casal, 2665-379, Milharado, Portugal";
    doc.setFontSize(LABEL_SIZE);
    doc.setFont("helvetica", "normal");
    doc.text("(2)", margin + 2, y);
    const label2 = "Morada, código postal, localidade, país:";
    doc.text(label2, textX, y);
    const label2W = doc.getTextWidth(label2);
    
    // Render value starting right after label, wrapping across the full content width
    doc.setFontSize(VALUE_SIZE);
    doc.setFont("helvetica", "normal");
    const val2X = textX + label2W + 1;
    const firstLineW = margin + cw - val2X - 2;
    const fullLineW = margin + cw - textX - 2;
    
    // Split first line manually, then remaining text wraps at full width
    const firstChunk = doc.splitTextToSize(address, firstLineW);
    doc.text(firstChunk[0], val2X, y);
    
    if (firstChunk.length > 1) {
      // Get remaining text after first line
      const remaining = address.substring(firstChunk[0].length).trim();
      if (remaining) {
        const restLines = doc.splitTextToSize(remaining, fullLineW);
        for (const line of restLines) {
          y += 4.5;
          doc.text(line, textX, y);
        }
      }
    }
    y += 6;
  }
  fieldRow("3", "Número de telefone (incluindo o prefixo internacional)", data.companyPhone || "+351 219667000");
  fieldRow("4", "Número de fax (incluindo o prefixo internacional)", data.companyFax || "+351 219667009");
  fieldRow("5", "Endereço de correio electrónico", data.companyEmail || "florencio.silva@tfs.pt");

  y += 1;

  // "Eu, abaixo assinado:"
  doc.setFontSize(HEADER_SIZE);
  doc.setFont("helvetica", "bold");
  doc.text("Eu, abaixo assinado:", margin + 2, y);
  y += 6;

  // Fields 6-7
  fieldRow("6", "Apelido e nome", toSurnameFirst(data.managerName));
  fieldRow("7", "Funções na empresa", data.managerPosition || "Responsável de Trafego");

  // "declaro que o conductor:"
  doc.setFontSize(HEADER_SIZE);
  doc.setFont("helvetica", "bold");
  doc.text("declaro que o conductor:", margin + 2, y);
  y += 6;

  // Fields 8-11
  fieldRow("8", "Apelido e nome", toSurnameFirst(data.driverName));
  fieldRow("9", "Data de nascimento (dia/mês/ano)", data.birthDate ? format(new Date(data.birthDate), "dd-MM-yyyy") : "___-___-______");
  fieldRow("10", "Número de carta de condução, de bilhete de identidade ou de passaporte", data.licenseNumber || "N/D");
  fieldRow("11", "que começou a trabalhar na empresa em (dia/mês/ano)", data.hireDate ? format(new Date(data.hireDate), "dd-MM-yyyy") : "___-___-______");

  // "no período:"
  doc.setFontSize(HEADER_SIZE);
  doc.setFont("helvetica", "bold");
  doc.text("no período:", margin + 2, y);
  y += 6;

  // Fields 12-13
  fieldRow("12", "de (hora/dia/mês/ano)", formatDT(data.gapStartDate));
  fieldRow("13", "até (hora/dia/mês/ano)", formatDT(data.gapEndDate));

  y += 1;

  // Reason checkboxes (14-19)
  const reasons = [
    { num: "14", text: "estava de baixa por doença***" },
    { num: "15", text: "gozava férias anuais ***" },
    { num: "16", text: "gozava de baixa ou de um período de repouso***" },
    { num: "17", text: "conduzia veículo não abrangido pelo Regulamento (EC) Nºou pelo AETR***" },
    { num: "18", text: "realizava outras actividades profissionais distintas da condução***" },
    { num: "19", text: "estava disponível***" },
  ];

  const selectedIdx = REASON_MAP[data.reasonCode];

  doc.setFontSize(LABEL_SIZE);
  for (const r of reasons) {
    const isSelected = parseInt(r.num) === selectedIdx;

    doc.setFont("helvetica", "normal");
    doc.text(`(${r.num})`, margin + 2, y);

    // Checkbox
    const cbX = textX;
    doc.setLineWidth(0.3);
    doc.rect(cbX, y - 3, 3.5, 3.5);
    if (isSelected) {
      doc.setLineWidth(0.5);
      // Draw X mark
      doc.line(cbX + 0.5, y - 2.5, cbX + 3, y + 0.0);
      doc.line(cbX + 3, y - 2.5, cbX + 0.5, y + 0.0);
      doc.setLineWidth(0.3);
    }

    doc.setFont("helvetica", "normal");
    const reasonLines = doc.splitTextToSize(r.text, cw - numCol - 6);
    doc.text(reasonLines, cbX + 5, y);
    y += reasonLines.length * 3.8 + 1.5;
  }

  if (data.reasonCode === "other" && data.reasonText) {
    doc.setFont("helvetica", "italic");
    doc.text(`Observações: ${data.reasonText}`, textX + 5, y);
    y += 5;
  }

  y += 2;

  // (20) Signature section - Company
  const today = data.signedAt ? formatD(data.signedAt) : formatD(new Date().toISOString());
  const loc = data.signingLocation || "Azambuja";

  doc.setFontSize(LABEL_SIZE);
  doc.setFont("helvetica", "normal");
  doc.text("(20)", margin + 2, y);
  doc.setFontSize(VALUE_SIZE);
  const locDateText20 = `Localidade:${loc}  Data:${today}`;
  doc.text(locDateText20, textX, y);
  y += 6;

  doc.setFontSize(LABEL_SIZE);
  const managerSigLabel = "Assinatura:…………………………………………………...";
  doc.text(managerSigLabel, margin + 2, y);
  const sigLine20Y = y;
  const sigW = 38;
  const sigH = 10;
  const sig20X = margin + 2 + doc.getTextWidth("Assinatura:") + 4;

  if (data.managerSignatureDataUrl) {
    try {
      // Position signature on the dotted line, not overlapping the date above
      doc.addImage(data.managerSignatureDataUrl, "PNG", sig20X, sigLine20Y - sigH / 2 - 4, sigW, sigH);
    } catch (e) { console.warn("Could not add manager signature", e); }
  }
  y += 10;

  // (21) Driver declaration
  doc.setFontSize(LABEL_SIZE);
  doc.setFont("helvetica", "normal");
  doc.text("(21)", margin + 2, y);
  const driverDecl = "Eu, abaixo assinado, o conductor, confirmo que, no período acima mencionado, não conduzi nenhum veículo abrangido pelo âmbito de aplicação do regulamento (CE) N.º561/2006 ou pelo AETR.";
  const declLines = doc.splitTextToSize(driverDecl, cw - numCol);
  doc.text(declLines, textX, y);
  y += declLines.length * 3.8 + 4;

  // (22) Driver signature
  doc.setFontSize(LABEL_SIZE);
  doc.setFont("helvetica", "normal");
  doc.text("(22)", margin + 2, y);
  doc.setFontSize(VALUE_SIZE);
  const locDateText22 = `Localidade:${loc}  Data:${today}`;
  doc.text(locDateText22, textX, y);
  y += 6;

  doc.setFontSize(LABEL_SIZE);
  const driverSigLabel = "Assinatura do conductor:…………………………………………………...";
  doc.text(driverSigLabel, margin + 2, y);
  const sigLine22Y = y;
  const sig22X = margin + 2 + doc.getTextWidth("Assinatura do conductor:") + 4;

  if (data.driverSignatureDataUrl) {
    try {
      doc.addImage(data.driverSignatureDataUrl, "PNG", sig22X, sigLine22Y - sigH / 2 - 4, sigW, sigH);
    } catch (e) { console.warn("Could not add driver signature", e); }
  }
  y += 12;

  // ── Close bordered form area ──
  const borderBottom = y;
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.rect(borderX, borderTop, borderW, borderBottom - borderTop);

  y += 8;

  // ── Digital signature audit trail ──
  if (data.signedAt || data.signedIP || data.verificationId) {
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    const signerLine = `Assinado digitalmente por ${data.driverName} em ${data.signedAt || today}`;
    doc.text(signerLine, margin, y);
    y += 3;
    const auditParts: string[] = [];
    if (data.signedIP) auditParts.push(`IP: ${data.signedIP}`);
    if (data.verificationId) auditParts.push(`ID de Verificação: ${data.verificationId}`);
    doc.text(`${auditParts.join(" — ")} — via TranspoGest`, margin, y);
    y += 5;
  }

  // ── Footnotes ──
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + 50, y);
  y += 4;

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  const fn1 = "¹       A versão electrónica e pronta a imprimir do presente formulário está disponível no seguinte endereço: http://ec.europa.eu";
  doc.text(fn1, margin, y);
  y += 5;
  const fn2 = "²       Acordo Europeu relativo ao Trabalho das Tripulações dês Veículos que Efectuam Transportes Rodoviários Internacionais.";
  doc.text(fn2, margin, y);
  y += 3.5;
  doc.text("*** Escolha apenas uma casa.", margin, y);

  // ── Footer: PT  1  PT ──
  const footerY = 285;
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("PT", margin, footerY);
  doc.text("PT", W - margin, footerY, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("1", W / 2, footerY, { align: "center" });

  // ── Company stamp (positioned to avoid overlapping date/signature text) ──
  if (stampDataUrl) {
    try {
      // Keep tiny variation but lock to safe area on the right side
      const randX = (Math.random() - 0.5) * 4;  // ±2mm
      const randY = (Math.random() - 0.5) * 3;  // ±1.5mm

      const stampW = 34;
      const stampH = 14;
      const baseX = W - margin - stampW - 2 + randX;
      const baseY = sigLine20Y - 9 + randY;

      doc.addImage(stampDataUrl, "PNG", baseX, baseY, stampW, stampH);
    } catch (e) {
      console.warn("Could not add stamp to PDF", e);
    }
  }

  return doc;
}
