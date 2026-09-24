import { OFFICER_ROLE_LABELS, SHARE_CLASS_LABELS } from "@/lib/domain";
import { getEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import { formatAddress } from "@/lib/validation/address";
import { formatDate, formatMoney } from "@/lib/utils";
import { renderPdf, theme } from "../pdf";
import type { DocumentContext } from "../types";

function companyFooter(ctx: DocumentContext) {
  const j = getJurisdiction(ctx.company.jurisdiction);
  return ctx.company.registryNumber
    ? `${ctx.company.name} · ${j.identifiers.companyNumber} ${ctx.company.registryNumber}`
    : ctx.company.name;
}

/** Platform-issued summary of the registration (distinct from the registry's own certificate). */
export function renderIncorporationSummary(ctx: DocumentContext): Promise<Uint8Array> {
  const j = getJurisdiction(ctx.company.jurisdiction);
  const entity = getEntityProfile(ctx.company.jurisdiction, ctx.company.entityType);
  return renderPdf({ title: `${ctx.company.name} — Certificate of Incorporation (Summary)`, footer: companyFooter(ctx) }, (w) => {
    w.title("Certificate of Incorporation — Summary", `${j.flag}  ${j.name} · ${j.registry.name}`);
    w.keyValue([
      ["Company name", ctx.company.name],
      ["Entity type", entity.label],
      [j.identifiers.companyNumber, ctx.company.registryNumber],
      ["Date of incorporation", ctx.company.incorporatedAt ? formatDate(ctx.company.incorporatedAt, { dateStyle: "long" }) : "Pending registration"],
      ["Registered office", formatAddress(ctx.company.registeredOffice)],
      ...(ctx.company.registeredAgentName ? ([["Registered agent", ctx.company.registeredAgentName]] as [string, string][]) : []),
      ...(ctx.company.principalAddress
        ? ([["Principal place of business", formatAddress(ctx.company.principalAddress)]] as [string, string][])
        : []),
      ["Business activity", ctx.company.businessActivity],
      ...(ctx.company.sicCodes?.length ? ([["SIC codes", ctx.company.sicCodes.join(", ")]] as [string, string][]) : []),
      [j.identifiers.taxId, ctx.company.taxId ?? "Not yet issued"],
    ]);

    w.heading("Officers");
    w.table(
      [
        { header: "Name", width: 0.3 },
        { header: "Role(s)", width: 0.25 },
        { header: "Residential address", width: 0.45 },
      ],
      ctx.officers.map((o) => [o.fullName, o.roles.map((r) => OFFICER_ROLE_LABELS[r]).join(", "), formatAddress(o.residentialAddress)]),
    );

    w.heading(entity.ownership.kind === "membership" ? "Members" : "Share capital");
    w.table(
      [
        { header: "Holder", width: 0.4 },
        { header: "Class", width: 0.25 },
        { header: entity.ownership.kind === "membership" ? "Interest" : "Shares", width: 0.15, align: "right" },
        { header: "%", width: 0.2, align: "right" },
      ],
      ctx.shareholders.map((s) => [
        s.fullName,
        SHARE_CLASS_LABELS[s.shareClass],
        entity.ownership.kind === "membership" ? `${s.units}%` : s.units.toLocaleString("en"),
        `${((s.units / ctx.totalUnits) * 100).toFixed(2)}%`,
      ]),
    );

    w.note(
      `This summary is prepared by GlobalCorp Hub from the details lodged with ${j.registry.name}. The registry-issued certificate is the authoritative record and is stored separately in your document vault.`,
    );
  });
}

export function renderShareholderRegister(ctx: DocumentContext): Promise<Uint8Array> {
  const j = getJurisdiction(ctx.company.jurisdiction);
  const entity = getEntityProfile(ctx.company.jurisdiction, ctx.company.entityType);
  const isMembership = entity.ownership.kind === "membership";
  const title = isMembership ? "Register of Members & Membership Interests" : "Register of Members";
  return renderPdf({ title: `${ctx.company.name} — ${title}`, footer: companyFooter(ctx), layout: "landscape" }, (w) => {
    w.title(title, `${ctx.company.name} · ${j.name}`);
    w.table(
      [
        { header: "Cert. #", width: 0.07 },
        { header: "Member", width: 0.2 },
        { header: "Address", width: 0.28 },
        { header: "Class", width: 0.13 },
        { header: isMembership ? "Interest" : "Number", width: 0.09, align: "right" },
        { header: "Paid per unit", width: 0.1, align: "right" },
        { header: "Beneficial", width: 0.06, align: "center" },
        { header: "Date", width: 0.07 },
      ],
      ctx.shareholders.map((s) => [
        s.certificateNumber ? String(s.certificateNumber) : "—",
        s.fullName,
        formatAddress(s.address),
        SHARE_CLASS_LABELS[s.shareClass],
        isMembership ? `${s.units}%` : s.units.toLocaleString("en"),
        isMembership ? "—" : formatMoney(s.pricePerUnit, j.currency),
        s.beneficiallyHeld ? "Yes" : "No",
        formatDate(ctx.company.incorporatedAt ?? ctx.generatedAt),
      ]),
    );
    w.paragraph(
      isMembership
        ? "Total membership interests: 100%"
        : `Total issued: ${ctx.totalUnits.toLocaleString("en")} shares`,
      { bold: true },
    );
    if (ctx.beneficialOwners.length) {
      const bo = j.people.beneficialOwnership;
      w.heading(bo.label);
      w.table(
        [
          { header: "Name", width: 0.35 },
          { header: "Ownership", width: 0.15, align: "right" },
          { header: "Nature of control", width: 0.5 },
        ],
        ctx.beneficialOwners.map((b) => [
          b.fullName,
          `${b.ownershipPercent}%`,
          b.natureOfControl.map((n) => bo.natureOfControlOptions.find((o) => o.value === n)?.label ?? n).join("; "),
        ]),
      );
    }
  });
}

export function renderShareCertificate(ctx: DocumentContext, holderIndex: number): Promise<Uint8Array> {
  const holder = ctx.shareholders[holderIndex];
  if (!holder) throw new Error(`No shareholder at index ${holderIndex}`);
  const j = getJurisdiction(ctx.company.jurisdiction);
  const certNo = holder.certificateNumber ?? holderIndex + 1;
  const directors = ctx.officers.filter((o) => o.roles.includes("DIRECTOR") || o.roles.includes("SECRETARY") || o.roles.includes("PRESIDENT"));

  return renderPdf(
    { title: `${ctx.company.name} — Share Certificate No. ${certNo}`, footer: companyFooter(ctx), layout: "landscape" },
    (w) => {
      const { doc } = w;
      const { width, height } = doc.page;
      doc.rect(28, 28, width - 56, height - 56).lineWidth(3).strokeColor(theme.accent).stroke();
      doc.rect(36, 36, width - 72, height - 72).lineWidth(0.8).strokeColor(theme.accent).stroke();

      doc.y = 70;
      doc.font(theme.serifBold).fontSize(28).fillColor(theme.accent).text("Share Certificate", w.left, doc.y, { width: w.contentWidth, align: "center" });
      doc.moveDown(0.3);
      doc.font(theme.serif).fontSize(12).fillColor(theme.muted).text(`Certificate No. ${certNo}`, { width: w.contentWidth, align: "center" });
      doc.moveDown(1.2);
      doc.font(theme.serifBold).fontSize(20).fillColor(theme.ink).text(ctx.company.name, { width: w.contentWidth, align: "center" });
      doc.font(theme.serif).fontSize(11).fillColor(theme.muted).text(
        `${j.identifiers.companyNumber} ${ctx.company.registryNumber ?? "(pending)"} · Incorporated in ${j.name}`,
        { width: w.contentWidth, align: "center" },
      );
      doc.moveDown(1.5);
      doc
        .font(theme.serif)
        .fontSize(13)
        .fillColor(theme.ink)
        .text(
          `This is to certify that ${holder.fullName} of ${formatAddress(holder.address)} is the registered holder of ${holder.units.toLocaleString("en")} fully paid ${SHARE_CLASS_LABELS[holder.shareClass].toLowerCase()} at an issue price of ${formatMoney(holder.pricePerUnit, j.currency)} each, subject to the ${ctx.company.jurisdiction === "UK" ? "articles of association" : ctx.company.jurisdiction === "AU" ? "constitution" : "bylaws"} of the company.`,
          w.left + 40,
          doc.y,
          { width: w.contentWidth - 80, align: "center", lineGap: 4 },
        );
      doc.moveDown(1);
      doc.font(theme.serif).fontSize(11).fillColor(theme.muted).text(
        `Issued on ${formatDate(ctx.company.incorporatedAt ?? ctx.generatedAt, { dateStyle: "long" })}${holder.beneficiallyHeld ? "" : " · Shares held non-beneficially"}`,
        { width: w.contentWidth, align: "center" },
      );
      doc.y = height - 170;
      w.signatureBlock(
        (directors.length ? directors : ctx.officers).slice(0, 2).map((o) => ({
          name: o.fullName,
          capacity: o.roles.map((r) => OFFICER_ROLE_LABELS[r]).join(" & "),
        })),
      );
    },
  );
}

export function renderConsentsToAct(ctx: DocumentContext): Promise<Uint8Array> {
  const j = getJurisdiction(ctx.company.jurisdiction);
  const law =
    ctx.company.jurisdiction === "AU"
      ? "section 201D of the Corporations Act 2001 (Cth)"
      : ctx.company.jurisdiction === "UK"
        ? "section 12 of the Companies Act 2006"
        : "the laws of the State of incorporation";

  return renderPdf({ title: `${ctx.company.name} — Consents to Act`, footer: companyFooter(ctx) }, (w) => {
    ctx.officers.forEach((officer, i) => {
      if (i > 0) w.doc.addPage();
      const roles = officer.roles.map((r) => OFFICER_ROLE_LABELS[r]).join(" and ");
      w.title(`Consent to Act as ${roles}`, `${ctx.company.name} · ${j.name}`);
      w.keyValue([
        ["Full name", officer.fullName],
        ["Residential address", formatAddress(officer.residentialAddress)],
        ["Date of birth", officer.dateOfBirth ? formatDate(officer.dateOfBirth, { dateStyle: "long" }) : undefined],
        ...(officer.placeOfBirth ? ([["Place of birth", officer.placeOfBirth]] as [string, string][]) : []),
        ...(officer.directorId ? ([["Director ID", officer.directorId]] as [string, string][]) : []),
      ]);
      w.paragraph(
        `I, ${officer.fullName}, consent to act as ${roles.toLowerCase()} of ${ctx.company.name} in accordance with ${law}, with effect from the date of the company's registration.`,
      );
      w.paragraph(
        "I confirm that I am not disqualified from managing a company, that the details above are correct, and that I understand the duties and responsibilities of the office.",
      );
      w.signatureBlock([{ name: officer.fullName, capacity: roles }]);
    });
  });
}
