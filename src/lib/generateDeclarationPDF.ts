import jsPDF from "jspdf";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface DeclarationPDFData {
  driverName: string;
  licenseNumber: string;
  gapStartDate: string;
  gapEndDate: string;
  reasonCode: string;
  reasonText?: string;
  managerName: string;
  companyName: string;
}

const REASON_MAP: Record<string, number> = {
  sick_leave: 11,
  vacation: 12,
  rest: 13,
  other_work: 14,
  exempt_vehicle: 15,
  other: 16,
};

export function generateDeclarationPDF(data: DeclarationPDFData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const margin = 20;
  const cw = W - 2 * margin; // content width

  const formatDT = (d: string) => format(new Date(d), "HH:mm/dd/MM/yyyy", { locale: pt });
  const formatD = (d: string) => format(new Date(d), "dd/MM/yyyy", { locale: pt });

  let y = 18;

  // Header
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("ANEXO", W / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("DECLARAÇÃO DE ACTIVIDADE", W / 2, y, { align: "center" });
  y += 7;

  doc.setFontSize(10);
  doc.text("(REGULAMENTO (CE) N.º 561/2006 OU AETR)", W / 2, y, { align: "center" });
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
    doc.text(`(${num}) ${label}: `, margin, y);
    doc.setFont("helvetica", "bold");
    doc.text(value, margin + doc.getTextWidth(`(${num}) ${label}: `), y);
    y += 5.5;
  };

  field("1", "Nome da empresa", data.companyName);
  field("2", "Morada", "Rua, Vale Casal, 42, Edf. Florêncio e Silva. Vale Casal, 2665-379 Milharado, Portugal");
  field("3", "Número de telefone", "+351 219667000");
  field("4", "Número de fax", "+351 219667009");
  field("5", "Endereço de correio electrónico", "florencio.silva@tfs.pt");

  y += 4;

  doc.setFont("helvetica", "normal");
  doc.text("Eu, abaixo assinado:", margin, y);
  y += 6;

  field("6", "Apelido e nome", data.managerName);
  field("7", "Funções na empresa", "Responsável de Tráfego");

  y += 3;
  doc.text("declaro que o condutor:", margin, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.text("Apelido e nome: ", margin, y);
  doc.setFont("helvetica", "bold");
  doc.text(data.driverName, margin + doc.getTextWidth("Apelido e nome: "), y);
  y += 6;

  field("8", "Data de nascimento (dia/mês/ano)", "___/___/______");

  doc.setFont("helvetica", "normal");
  doc.text("Número de carta de condução, de bilhete de identidade ou de passaporte: ", margin, y);
  doc.setFont("helvetica", "bold");
  doc.text(data.licenseNumber || "N/D", margin + doc.getTextWidth("Número de carta de condução, de bilhete de identidade ou de passaporte: "), y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.text("que começou a trabalhar na empresa em (dia/mês/ano): ___/___/______", margin, y);
  y += 7;

  doc.text("no período:", margin, y);
  y += 6;

  field("9", "de (hora/dia/mês/ano)", formatDT(data.gapStartDate));
  field("10", "até (hora/dia/mês/ano)", formatDT(data.gapEndDate));

  y += 3;

  // Reason checkboxes
  const reasons = [
    { num: "11", text: "estava de baixa por doença ou lesão" },
    { num: "12", text: "gozava férias anuais" },
    { num: "13", text: "gozava de baixa ou de um período de repouso" },
    { num: "14", text: "conduzia um veículo não abrangido pelo Regulamento (CE) n.º 561/2006 ou pelo AETR" },
    { num: "15", text: "realizava outras actividades profissionais distintas da condução" },
    { num: "16", text: "estava disponível" },
  ];

  const selectedIdx = REASON_MAP[data.reasonCode];

  for (const r of reasons) {
    const isSelected = parseInt(r.num) === selectedIdx;
    // Draw checkbox
    doc.setLineWidth(0.3);
    doc.rect(margin, y - 3.2, 3.5, 3.5);
    if (isSelected) {
      doc.setFont("helvetica", "bold");
      doc.text("X", margin + 0.7, y);
    }
    doc.setFont("helvetica", "normal");
    doc.text(`(${r.num}) ${r.text}`, margin + 5.5, y);
    y += 5.5;
  }

  if (data.reasonCode === "other" && data.reasonText) {
    doc.setFont("helvetica", "italic");
    doc.text(`Observações: ${data.reasonText}`, margin + 5.5, y);
    y += 5.5;
  }

  y += 5;

  // Signature section - Company
  doc.setFont("helvetica", "normal");
  const today = formatD(new Date().toISOString());
  doc.text(`(17) Localidade: Alverca     Data: ${today}`, margin, y);
  y += 6;
  doc.text("Assinatura: …………………………………………………………", margin, y);
  y += 10;

  // Signature section - Driver
  doc.setFontSize(8);
  const driverDecl = "Eu, abaixo assinado, o condutor, confirmo que, no período acima mencionado, não conduzi nenhum veículo abrangido pelo âmbito de aplicação do Regulamento (CE) n.º 561/2006 ou pelo AETR.";
  const declLines = doc.splitTextToSize(`(18) ${driverDecl}`, cw);
  doc.text(declLines, margin, y);
  y += declLines.length * 4 + 4;

  doc.setFontSize(9);
  doc.text(`(19) Localidade: Alverca     Data: ${today}`, margin, y);
  y += 6;
  doc.text("Assinatura do condutor: …………………………………………………………", margin, y);
  y += 12;

  // Footer
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "italic");
  doc.line(margin, y, W - margin, y);
  y += 3;
  doc.text("¹ A versão electrónica e pronta a imprimir do presente formulário está disponível no seguinte endereço: http://ec.europa.eu.", margin, y);
  y += 3;
  doc.text("² Acordo Europeu relativo ao Trabalho das Tripulações de Veículos que Efectuam Transportes Rodoviários Internacionais.", margin, y);
  y += 3;
  doc.text("*** Escolha apenas uma casa.", margin, y);
  y += 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("PT    1    PT", W / 2, y, { align: "center" });

  return doc;
}
