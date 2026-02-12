import jsPDF from "jspdf";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

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
}

const REASON_MAP: Record<string, number> = {
  sick_leave: 14,
  vacation: 15,
  rest: 16,
  exempt_vehicle: 17,
  other_work: 18,
  other: 19,
};

export function generateDeclarationPDF(data: DeclarationPDFData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const margin = 20;
  const cw = W - 2 * margin;

  const formatDT = (d: string) => format(new Date(d), "HH:mm'-'dd'-'MM'-'yyyy", { locale: pt });
  const formatD = (d: string) => format(new Date(d), "dd/MM/yyyy", { locale: pt });

  let y = 18;

  // Header
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("ANEXO", W / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("DECLARAÇÃO DE ACTIVIDADE¹", W / 2, y, { align: "center" });
  y += 7;

  doc.setFontSize(10);
  doc.text("(REGULAMENTO (CE) Nº561/2006 OU AETR²)", W / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  const subtext = "Preencher (texto dactilografado) e assinar antes de cada viagem. Conservar juntamente com os registos originais do aparelho de controlo, sempre que necessário.";
  const subLines = doc.splitTextToSize(subtext, cw);
  doc.text(subLines, W / 2, y, { align: "center" });
  y += subLines.length * 3.5 + 2;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("AS FALSAS DECLARAÇÕES CONSTITUEM UMA INFRACÇÃO", W / 2, y, { align: "center" });
  y += 8;

  // Horizontal line
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(margin, y, W - margin, y);
  y += 6;

  // Part: Company
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Parte a preencher pela empresa", margin, y);
  y += 7;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  const field = (num: string, label: string, value: string) => {
    doc.setFont("helvetica", "normal");
    const prefix = `(${num}) ${label}: `;
    doc.text(prefix, margin, y);
    doc.setFont("helvetica", "bold");
    doc.text(value, margin + doc.getTextWidth(prefix), y);
    y += 5.5;
  };

  field("1", "Nome da empresa", data.companyName);
  field("2", "Morada, código postal, localidade, país", data.companyAddress || "Rua Vale Casal, 42, Edf. Florêncio E Silva. Vale Casal, 2665-379, Milharado, Portugal");
  field("3", "Número de telefone (incluindo o prefixo internacional)", data.companyPhone || "+351 219667000");
  field("4", "Número de fax (incluindo o prefixo internacional)", data.companyFax || "+351 219667009");
  field("5", "Endereço de correio electrónico", data.companyEmail || "florencio.silva@tfs.pt");

  y += 4;

  doc.setFont("helvetica", "normal");
  doc.text("Eu, abaixo assinado:", margin, y);
  y += 6;

  field("6", "Apelido e nome", data.managerName);
  field("7", "Funções na empresa", data.managerPosition || "Responsável de Trafego");

  y += 3;
  doc.setFont("helvetica", "normal");
  doc.text("declaro que o condutor:", margin, y);
  y += 6;

  field("8", "Apelido e nome", data.driverName);
  field("9", "Data de nascimento (dia/mês/ano)", data.birthDate ? format(new Date(data.birthDate), "dd-MM-yyyy") : "___-___-______");
  field("10", "Número de carta de condução, de bilhete de identidade ou de passaporte", data.licenseNumber || "N/D");
  field("11", "que começou a trabalhar na empresa em (dia/mês/ano)", data.hireDate ? format(new Date(data.hireDate), "dd-MM-yyyy") : "___-___-______");

  y += 2;

  field("12", "no período", formatDT(data.gapStartDate));
  field("13", "até (hora/dia/mês/ano)", formatDT(data.gapEndDate));

  y += 3;

  // Reason checkboxes (14-19)
  const reasons = [
    { num: "14", text: "estava de baixa por doença***" },
    { num: "15", text: "gozava férias anuais***" },
    { num: "16", text: "gozava de baixa ou de um período de repouso***" },
    { num: "17", text: "conduzia veículo não abrangido pelo Regulamento (CE) Nº561/2006 ou pelo AETR***" },
    { num: "18", text: "realizava outras actividades profissionais distintas da condução***" },
    { num: "19", text: "estava disponível***" },
  ];

  const selectedIdx = REASON_MAP[data.reasonCode];

  for (const r of reasons) {
    const isSelected = parseInt(r.num) === selectedIdx;
    doc.setLineWidth(0.3);
    doc.rect(margin, y - 3.2, 3.5, 3.5);
    if (isSelected) {
      doc.setFont("helvetica", "bold");
      doc.text("X", margin + 0.7, y);
    }
    doc.setFont("helvetica", "normal");
    const reasonText = `(${r.num}) ${r.text}`;
    const reasonLines = doc.splitTextToSize(reasonText, cw - 6);
    doc.text(reasonLines, margin + 5.5, y);
    y += reasonLines.length * 4 + 1.5;
  }

  if (data.reasonCode === "other" && data.reasonText) {
    doc.setFont("helvetica", "italic");
    doc.text(`Observações: ${data.reasonText}`, margin + 5.5, y);
    y += 5.5;
  }

  y += 5;

  // (20) Signature section - Company
  doc.setFont("helvetica", "normal");
  const today = data.signedAt ? formatD(data.signedAt) : formatD(new Date().toISOString());
  const loc = data.signingLocation || "Azambuja";
  doc.text(`(20) Localidade: ${loc}     Data: ${today}`, margin, y);
  y += 6;
  doc.text("Assinatura:………………………………………………...", margin, y);

  if (data.managerSignatureDataUrl) {
    try {
      doc.addImage(data.managerSignatureDataUrl, "PNG", margin + 22, y - 8, 50, 15);
    } catch (e) { console.warn("Could not add manager signature", e); }
  }
  y += 12;

  // (21) Driver declaration
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const driverDecl = "Eu, abaixo assinado, o condutor, confirmo que, no período acima mencionado, não conduzi nenhum veículo abrangido pelo âmbito de aplicação do Regulamento (CE) N.º561/2006 ou pelo AETR.";
  const declLines = doc.splitTextToSize(`(21) ${driverDecl}`, cw);
  doc.text(declLines, margin, y);
  y += declLines.length * 4 + 4;

  // (22) Driver signature
  doc.setFontSize(9);
  doc.text(`(22) Localidade: ${loc}     Data: ${today}`, margin, y);
  y += 6;
  doc.text("Assinatura do condutor:………………………………………………...", margin, y);

  if (data.driverSignatureDataUrl) {
    try {
      doc.addImage(data.driverSignatureDataUrl, "PNG", margin + 42, y - 8, 50, 15);
    } catch (e) { console.warn("Could not add driver signature", e); }
  }
  y += 12;

  // Footer
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "italic");
  doc.line(margin, y, W - margin, y);
  y += 3;

  // Digital signature audit trail watermark
  if (data.signedAt || data.signedIP || data.verificationId) {
    doc.setFont("helvetica", "bold");
    const signerLine = `Assinado digitalmente por ${data.driverName} em ${data.signedAt || today}`;
    doc.text(signerLine, margin, y);
    y += 3;
    const auditParts: string[] = [];
    if (data.signedIP) auditParts.push(`IP: ${data.signedIP}`);
    if (data.verificationId) auditParts.push(`ID de Verificação: ${data.verificationId}`);
    doc.text(`${auditParts.join(" — ")} — via TranspoGest`, margin, y);
    y += 3;
    doc.setFont("helvetica", "italic");
  }

  doc.text("¹ A versão electrónica e pronta a imprimir do presente formulário está disponível no seguinte endereço: http://ec.europa.eu", margin, y);
  y += 3;
  doc.text("² Acordo Europeu relativo ao Trabalho das Tripulações dos Veículos que Efectuam Transportes Rodoviários Internacionais.", margin, y);
  y += 3;
  doc.text("*** Escolha apenas uma casa.", margin, y);
  y += 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("PT    1    PT", W / 2, y, { align: "center" });

  return doc;
}
