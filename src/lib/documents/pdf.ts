import PDFDocument from "pdfkit";

/**
 * Small layout toolkit on top of PDFKit so templates read like documents,
 * not coordinate maths. Uses only the built-in standard fonts, so no font
 * files need to ship with the app.
 */

export const theme = {
  ink: "#0f172a",
  muted: "#475569",
  accent: "#1e40af",
  rule: "#cbd5e1",
  fill: "#f1f5f9",
  font: "Helvetica",
  bold: "Helvetica-Bold",
  serif: "Times-Roman",
  serifBold: "Times-Bold",
} as const;

export interface PdfMeta {
  title: string;
  subject?: string;
  /** Footer text on every page, e.g. company name + number. */
  footer?: string;
  /** Diagonal watermark, e.g. for simulated registry documents. */
  watermark?: string;
  layout?: "portrait" | "landscape";
}

export interface TableColumn {
  header: string;
  /** Fraction of the content width. */
  width: number;
  align?: "left" | "right" | "center";
}

export class PdfWriter {
  constructor(readonly doc: PDFKit.PDFDocument) {}

  get contentWidth() {
    return this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right;
  }

  get left() {
    return this.doc.page.margins.left;
  }

  private get bottomLimit() {
    return this.doc.page.height - this.doc.page.margins.bottom;
  }

  ensureSpace(height: number) {
    if (this.doc.y + height > this.bottomLimit) this.doc.addPage();
  }

  title(text: string, subtitle?: string) {
    this.doc.font(theme.bold).fontSize(20).fillColor(theme.ink).text(text, this.left, this.doc.y, { width: this.contentWidth });
    if (subtitle) {
      this.doc.moveDown(0.2).font(theme.font).fontSize(11).fillColor(theme.muted).text(subtitle, { width: this.contentWidth });
    }
    this.rule();
    return this;
  }

  heading(text: string) {
    this.ensureSpace(40);
    this.doc.moveDown(0.6).font(theme.bold).fontSize(12.5).fillColor(theme.accent).text(text, this.left, this.doc.y, { width: this.contentWidth });
    this.doc.moveDown(0.3);
    return this;
  }

  paragraph(text: string, opts: { size?: number; color?: string; bold?: boolean; align?: "left" | "justify" | "center" } = {}) {
    this.doc
      .font(opts.bold ? theme.bold : theme.font)
      .fontSize(opts.size ?? 10)
      .fillColor(opts.color ?? theme.ink)
      .text(text, this.left, this.doc.y, { width: this.contentWidth, align: opts.align ?? "left", lineGap: 2 });
    this.doc.moveDown(0.5);
    return this;
  }

  /** Numbered legal clause: "3.2  Text…" with a hanging indent. */
  clause(number: string, text: string) {
    const indent = 34;
    this.doc.font(theme.font).fontSize(10);
    const height = this.doc.heightOfString(text, { width: this.contentWidth - indent, lineGap: 2 });
    this.ensureSpace(Math.min(height, 80));
    const y = this.doc.y;
    this.doc.fillColor(theme.muted).text(number, this.left, y, { width: indent });
    this.doc.fillColor(theme.ink).text(text, this.left + indent, y, { width: this.contentWidth - indent, lineGap: 2, align: "justify" });
    this.doc.moveDown(0.45);
    return this;
  }

  keyValue(rows: [string, string | undefined | null][], labelWidth = 0.34) {
    const lw = this.contentWidth * labelWidth;
    for (const [label, value] of rows) {
      const v = value && value.length ? value : "—";
      this.doc.font(theme.font).fontSize(10);
      const h = Math.max(this.doc.heightOfString(v, { width: this.contentWidth - lw }), 12);
      this.ensureSpace(h + 6);
      const y = this.doc.y;
      this.doc.fillColor(theme.muted).text(label, this.left, y, { width: lw - 8 });
      this.doc.fillColor(theme.ink).font(theme.bold).text(v, this.left + lw, y, { width: this.contentWidth - lw });
      this.doc.y = y + h + 6;
    }
    return this;
  }

  table(columns: TableColumn[], rows: string[][]) {
    const pad = 5;
    const widths = columns.map((c) => c.width * this.contentWidth);
    const drawRow = (cells: string[], header: boolean) => {
      this.doc.font(header ? theme.bold : theme.font).fontSize(9);
      const height =
        Math.max(...cells.map((cell, i) => this.doc.heightOfString(cell || "—", { width: widths[i]! - pad * 2 }))) + pad * 2;
      if (this.doc.y + height > this.bottomLimit) {
        this.doc.addPage();
        if (!header) drawRow(columns.map((c) => c.header), true);
        this.doc.font(header ? theme.bold : theme.font).fontSize(9);
      }
      const y = this.doc.y;
      if (header) this.doc.rect(this.left, y, this.contentWidth, height).fill(theme.fill);
      let x = this.left;
      cells.forEach((cell, i) => {
        this.doc
          .fillColor(header ? theme.muted : theme.ink)
          .text(cell || "—", x + pad, y + pad, { width: widths[i]! - pad * 2, align: columns[i]!.align ?? "left" });
        x += widths[i]!;
      });
      this.doc
        .moveTo(this.left, y + height)
        .lineTo(this.left + this.contentWidth, y + height)
        .lineWidth(0.5)
        .strokeColor(theme.rule)
        .stroke();
      this.doc.y = y + height;
    };
    drawRow(columns.map((c) => c.header), true);
    rows.forEach((r) => drawRow(r, false));
    this.doc.moveDown(0.8);
    return this;
  }

  signatureBlock(signatories: { name: string; capacity: string }[]) {
    const colWidth = (this.contentWidth - 24) / 2;
    for (let i = 0; i < signatories.length; i += 2) {
      this.ensureSpace(80);
      const y = this.doc.y + 30;
      signatories.slice(i, i + 2).forEach((s, j) => {
        const x = this.left + j * (colWidth + 24);
        this.doc.moveTo(x, y).lineTo(x + colWidth, y).lineWidth(0.7).strokeColor(theme.ink).stroke();
        this.doc.font(theme.bold).fontSize(9.5).fillColor(theme.ink).text(s.name, x, y + 5, { width: colWidth });
        this.doc.font(theme.font).fontSize(8.5).fillColor(theme.muted).text(s.capacity, x, y + 18, { width: colWidth });
        this.doc.text("Date: ____ / ____ / ________", x, y + 30, { width: colWidth });
      });
      this.doc.y = y + 50;
    }
    return this;
  }

  rule() {
    const y = this.doc.y + 8;
    this.doc.moveTo(this.left, y).lineTo(this.left + this.contentWidth, y).lineWidth(0.8).strokeColor(theme.rule).stroke();
    this.doc.y = y + 12;
    return this;
  }

  note(text: string) {
    this.ensureSpace(40);
    const h = this.doc.font(theme.font).fontSize(8.5).heightOfString(text, { width: this.contentWidth - 16 }) + 12;
    const y = this.doc.y;
    this.doc.rect(this.left, y, this.contentWidth, h).fill(theme.fill);
    this.doc.fillColor(theme.muted).text(text, this.left + 8, y + 6, { width: this.contentWidth - 16 });
    this.doc.y = y + h + 8;
    return this;
  }
}

export function renderPdf(meta: PdfMeta, draw: (w: PdfWriter) => void): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: meta.layout ?? "portrait",
      margins: { top: 56, bottom: 64, left: 56, right: 56 },
      bufferPages: true,
      info: { Title: meta.title, Subject: meta.subject ?? meta.title, Author: "GlobalCorp Hub", Creator: "GlobalCorp Hub document service" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));

    try {
      draw(new PdfWriter(doc));
      decoratePages(doc, meta);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function decoratePages(doc: PDFKit.PDFDocument, meta: PdfMeta) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const { width, height, margins } = doc.page;
    const bottom = margins.bottom;
    doc.page.margins.bottom = 0; // allow writing inside the bottom margin without auto page breaks

    if (meta.watermark) {
      doc.save();
      doc.rotate(-35, { origin: [width / 2, height / 2] });
      doc
        .font(theme.bold)
        .fontSize(46)
        .fillColor("#dc2626")
        .fillOpacity(0.08)
        .text(meta.watermark, 0, height / 2 - 30, { width, align: "center" });
      doc.restore();
      doc.fillOpacity(1);
    }

    doc
      .font(theme.font)
      .fontSize(7.5)
      .fillColor(theme.muted)
      .text(
        `${meta.footer ?? meta.title}   ·   Page ${i - range.start + 1} of ${range.count}`,
        margins.left,
        height - bottom + 24,
        { width: width - margins.left - margins.right, align: "center", lineBreak: false },
      );
    doc.page.margins.bottom = bottom;
  }
}
