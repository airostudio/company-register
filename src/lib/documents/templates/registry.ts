import { formatDate } from "@/lib/utils";
import { renderPdf, theme } from "../pdf";

export interface RegistryCertificateInput {
  registryName: string;
  statute: string;
  companyName: string;
  numberLabel: string;
  registryNumber: string;
  entityLabel: string;
  jurisdictionName: string;
  incorporatedAt: string;
  filingReference: string;
}

/** "Official" certificate issued by a simulated registry. Watermarked so it can't be mistaken for the real thing. */
export function renderRegistryCertificate(input: RegistryCertificateInput): Promise<Uint8Array> {
  return renderPdf(
    {
      title: `${input.registryName} — Certificate of Registration — ${input.companyName}`,
      footer: `Simulated ${input.registryName} document · Ref ${input.filingReference}`,
      watermark: "SIMULATED · NOT AN OFFICIAL DOCUMENT",
    },
    (w) => {
      const { doc } = w;
      doc.y = 110;
      doc.font(theme.serif).fontSize(13).fillColor(theme.muted).text(input.registryName.toUpperCase(), { width: w.contentWidth, align: "center", characterSpacing: 2 });
      doc.moveDown(1.2);
      doc.font(theme.serifBold).fontSize(26).fillColor(theme.ink).text("Certificate of Registration", { width: w.contentWidth, align: "center" });
      doc.moveDown(0.3);
      doc.font(theme.serif).fontSize(12).fillColor(theme.muted).text(`of a ${input.entityLabel}`, { width: w.contentWidth, align: "center" });
      doc.moveDown(2);
      doc.font(theme.serif).fontSize(13).fillColor(theme.ink).text(
        `This is to certify that ${input.companyName}, ${input.numberLabel} ${input.registryNumber}, is registered as a ${input.entityLabel.toLowerCase()} under ${input.statute}, in ${input.jurisdictionName}.`,
        w.left + 30,
        doc.y,
        { width: w.contentWidth - 60, align: "center", lineGap: 5 },
      );
      doc.moveDown(1.5);
      doc.text(`The date of commencement of registration is ${formatDate(input.incorporatedAt, { dateStyle: "long" })}.`, {
        width: w.contentWidth - 60,
        align: "center",
      });
      doc.moveDown(4);
      doc.font(theme.serifBold).fontSize(11).text(`Issued by the ${input.registryName}`, { width: w.contentWidth - 60, align: "center" });
      doc.font(theme.serif).fontSize(10).fillColor(theme.muted).text(`Lodgement reference ${input.filingReference}`, {
        width: w.contentWidth - 60,
        align: "center",
      });
    },
  );
}

export interface FilingReceiptInput {
  registryName: string;
  formName: string;
  companyName: string;
  filingReference: string;
  lodgedAt: string;
  lodger: string;
  lines: [string, string][];
}

export function renderFilingReceipt(input: FilingReceiptInput): Promise<Uint8Array> {
  return renderPdf(
    {
      title: `${input.formName} — ${input.companyName}`,
      footer: `Simulated ${input.registryName} lodgement receipt · Ref ${input.filingReference}`,
      watermark: "SIMULATED",
    },
    (w) => {
      w.title(`${input.formName}`, `${input.registryName} — lodgement receipt`);
      w.keyValue([
        ["Company", input.companyName],
        ["Lodgement reference", input.filingReference],
        ["Lodged", formatDate(input.lodgedAt, { dateStyle: "long", timeStyle: "short" })],
        ["Lodging party", input.lodger],
        ...input.lines,
      ]);
    },
  );
}
