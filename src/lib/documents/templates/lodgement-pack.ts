import { OFFICER_ROLE_LABELS, SHARE_CLASS_LABELS } from "@/lib/domain";
import { countryName } from "@/lib/countries";
import { getEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import type { FormationPayload } from "@/lib/registry/types";
import { formatAddress } from "@/lib/validation/address";
import { formatUnitPrice } from "@/lib/utils";
import { renderPdf } from "../pdf";

/** Internal data sheet staff use to key an assisted lodgement into the registry's portal. */
export function renderLodgementPack(payload: FormationPayload, reference: string): Promise<Uint8Array> {
  const profile = getJurisdiction(payload.jurisdiction);
  const entity = getEntityProfile(payload.jurisdiction, payload.entityType);
  return renderPdf({ title: `Lodgement pack ${reference}`, footer: `INTERNAL — ${reference} — contains personal information` }, (w) => {
    w.title(`Lodgement pack — ${payload.companyName}`, `${profile.registry.name} · ${entity.label} · ${reference}`);
    w.note("Internal document. Contains personal information: don't email or print unnecessarily, and delete local copies after lodging.");
    w.heading("Company");
    w.keyValue([
      ["Proposed name", payload.companyName],
      ["Entity type", entity.label],
      ["Jurisdiction", profile.name],
      ["Priority", payload.expedited ? "EXPEDITED" : "Standard"],
      ["Registered office", formatAddress(payload.registeredOffice)],
      ["Registered agent", payload.registeredAgent?.name],
      ["Principal place of business", payload.principalPlaceOfBusiness ? formatAddress(payload.principalPlaceOfBusiness) : undefined],
      ["Business activity", payload.businessActivity],
      ["SIC codes", payload.sicCodes.join(", ") || undefined],
      ["Lodging on behalf of", `${payload.lodger.name} <${payload.lodger.email}>`],
    ]);
    w.heading("Officers");
    payload.officers.forEach((o, i) => {
      w.paragraph(`${i + 1}. ${o.fullName}`, { bold: true });
      w.keyValue([
        ["Roles", o.roles.map((r) => OFFICER_ROLE_LABELS[r]).join(", ")],
        ["Date of birth", o.dateOfBirth],
        ["Place of birth", o.placeOfBirth],
        ["Nationality", o.nationality ? countryName(o.nationality) : undefined],
        ["Residential address", formatAddress(o.residentialAddress)],
        ["Director ID", o.directorId],
        ["CH personal code", o.identityVerificationCode],
      ]);
    });
    w.heading(entity.ownership.kind === "membership" ? "Members" : `Share capital (${payload.shareCapital.totalUnits.toLocaleString("en")} total)`);
    w.table(
      [
        { header: "Holder", width: 0.3 },
        { header: "Address", width: 0.34 },
        { header: "Class", width: 0.14 },
        { header: "Units", width: 0.1, align: "right" },
        { header: "Price", width: 0.12, align: "right" },
      ],
      payload.shareholders.map((s) => [
        `${s.fullName}${s.holderType === "CORPORATE" ? " (corporate)" : ""}${s.beneficiallyHeld ? "" : " — non-beneficial"}`,
        formatAddress(s.address),
        SHARE_CLASS_LABELS[s.shareClass],
        s.units.toLocaleString("en"),
        formatUnitPrice(s.pricePerUnit, profile.currency),
      ]),
    );
    w.heading(profile.people.beneficialOwnership.label);
    if (payload.beneficialOwners.length === 0) {
      w.paragraph(payload.noBeneficialOwnersStatement ? "Statement: no registrable beneficial owners." : "None declared.");
    }
    payload.beneficialOwners.forEach((b) =>
      w.keyValue([
        ["Name", b.fullName],
        ["Ownership", `${b.ownershipPercent}%`],
        ["Nature of control", b.natureOfControl.join(", ")],
        ["Date of birth", b.dateOfBirth],
        ["Residential address", formatAddress(b.residentialAddress)],
        ["CH personal code", b.identityVerificationCode],
      ]),
    );
  });
}
