import type { TaxApplication } from "@/lib/tax/application";
import { formatDate } from "@/lib/utils";
import { renderPdf } from "../pdf";

const AUTHORITY_NAMES = { IRS: "Internal Revenue Service", ABR: "Australian Business Register", HMRC: "HM Revenue & Customs" } as const;
const NUMBER_LABELS = { IRS: "Employer Identification Number (EIN)", ABR: "Australian Business Number (ABN)", HMRC: "Unique Taxpayer Reference (UTR)" } as const;

/** Internal worksheet staff use to complete the tax authority's form. */
export function renderTaxWorksheet(app: TaxApplication, reference: string): Promise<Uint8Array> {
  return renderPdf({ title: `${app.form} — ${app.companyName}`, footer: `INTERNAL — ${reference} — contains personal information` }, (w) => {
    w.title(app.form, `${AUTHORITY_NAMES[app.authority]} · ${app.companyName} · ${reference}`);
    if (app.foreignApplicant) w.note("Foreign responsible party: no local tax number. Follow the authority's process for non-resident applicants.");
    for (const section of app.sections) {
      w.heading(section.title);
      w.keyValue(section.fields);
    }
  });
}

/** Customer-facing confirmation of the issued tax number. */
export function renderTaxConfirmation(opts: { app: TaxApplication; taxId: string; issuedAt: string; simulated: boolean }): Promise<Uint8Array> {
  const { app, taxId, issuedAt, simulated } = opts;
  return renderPdf(
    {
      title: `${NUMBER_LABELS[app.authority]} — ${app.companyName}`,
      footer: `${app.companyName} · ${NUMBER_LABELS[app.authority]}`,
      watermark: simulated ? "SIMULATED · NOT AN OFFICIAL NUMBER" : undefined,
    },
    (w) => {
      w.title("Tax registration confirmation", AUTHORITY_NAMES[app.authority]);
      w.keyValue([
        ["Company", app.companyName],
        ["Registry number", app.registryNumber],
        [NUMBER_LABELS[app.authority], taxId],
        ["Issued", formatDate(issuedAt, { dateStyle: "long" })],
      ]);
      w.note(
        simulated
          ? "Issued by the development simulator. It is not a real tax number."
          : `Recorded by GlobalCorp Hub from the ${AUTHORITY_NAMES[app.authority]}'s confirmation. Keep the authority's own letter with your company records.`,
      );
    },
  );
}
