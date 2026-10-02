import { renderFilingReceipt, renderRegistryCertificate } from "@/lib/documents";
import type { Jurisdiction } from "@/lib/domain";
import type { FilingStatusResult, FormationPayload, OfficialDocument, RegistryIssue } from "../types";
import { MockRegistryAdapter } from "./simulator";

const SCOTTISH_AREAS = ["AB", "DD", "DG", "EH", "FK", "G", "HS", "IV", "KA", "KW", "KY", "ML", "PA", "PH", "TD", "ZE"];

/** Which UK registration region a postcode belongs to (approximate — border postcodes exist). */
export function ukPostcodeRegion(postcode: string): "SCT" | "NIR" | "ENG_WLS" | undefined {
  const area = /^([A-Z]{1,2})\d/i.exec(postcode.trim())?.[1]?.toUpperCase();
  if (!area) return undefined;
  if (area === "BT") return "NIR";
  if (SCOTTISH_AREAS.includes(area)) return "SCT";
  return "ENG_WLS";
}

/** Simulates the Companies House software filing (IN01) gateway. */
export class MockCompaniesHouseAdapter extends MockRegistryAdapter {
  readonly registryCode = "CH";
  readonly jurisdictions: readonly Jurisdiction[] = ["UK"];

  protected readonly timeline = {
    toUnderReviewMs: 5_000,
    toDecisionMs: 15_000,
    expeditedFactor: 0.5,
    nameSearchLatencyMs: 200,
  };

  protected readonly takenNames = [
    { name: "Acme Widgets Ltd", number: "10000001" },
    { name: "Thames Digital Limited", number: "10000002" },
    { name: "Pennine Outdoor Ltd", number: "10000003" },
    { name: "Albion Analytics Ltd", number: "10000004" },
    { name: "Highland Distillers Ltd", number: "SC000005" },
  ];


  protected validateLodgement(payload: FormationPayload): RegistryIssue[] {
    const issues: RegistryIssue[] = [];
    const office = payload.registeredOffice;
    const postcodeRegion = ukPostcodeRegion(office.postcode);
    const declared = office.region === "SCT" ? "SCT" : office.region === "NIR" ? "NIR" : "ENG_WLS";
    if (office.country !== "GB" || !postcodeRegion) {
      issues.push({ code: "INVALID_POSTAL_CODE", field: "registeredOffice.postcode", message: `Postcode ${office.postcode} was not recognised.` });
    } else if (postcodeRegion !== declared) {
      issues.push({
        code: "INVALID_POSTAL_CODE",
        field: "registeredOffice.postcode",
        message: `Postcode ${office.postcode} is not in the registration jurisdiction you selected (${office.region}).`,
      });
    }
    if (payload.sicCodes.length === 0) {
      issues.push({ code: "VALIDATION_FAILED", field: "sicCodes", message: "At least one SIC code is required." });
    }
    if (payload.beneficialOwners.length === 0 && !payload.noBeneficialOwnersStatement) {
      issues.push({ code: "VALIDATION_FAILED", field: "beneficialOwners", message: "A PSC or a statement of no PSC is required." });
    }
    return issues;
  }

  protected formatRegistryNumber(seed: number): string {
    return String(16_000_000 + (seed % 999_999)).padStart(8, "0");
  }

  protected async renderOfficialDocuments(
    payload: FormationPayload,
    registration: NonNullable<FilingStatusResult["registration"]>,
  ): Promise<OfficialDocument[]> {
    const region = payload.registeredOffice.region;
    const number = registration.registryNumber;
    const name = registration.legalName ?? payload.companyName;
    const [certificate, receipt] = await Promise.all([
      renderRegistryCertificate({
        registryName: "Companies House",
        statute: "the Companies Act 2006",
        companyName: name,
        numberLabel: "Company No.",
        registryNumber: number,
        entityLabel: "Private company limited by shares",
        jurisdictionName: region === "SCT" ? "Scotland" : region === "NIR" ? "Northern Ireland" : "England and Wales",
        incorporatedAt: registration.incorporatedAt,
        filingReference: payload.clientReference,
      }),
      renderFilingReceipt({
        registryName: "Companies House",
        formName: "IN01 — Application to register a company",
        companyName: name,
        filingReference: payload.clientReference,
        lodgedAt: registration.incorporatedAt,
        lodger: `${payload.lodger.name} via GlobalCorp Hub`,
        lines: [
          ["Company number", number],
          ["SIC codes", payload.sicCodes.join(", ")],
          ["PSCs", payload.beneficialOwners.map((b) => b.fullName).join(", ") || "Statement: no registrable PSC"],
        ],
      }),
    ]);
    return [
      { type: "CERTIFICATE_OF_INCORPORATION", title: "Companies House Certificate of Incorporation", fileName: "companies-house-certificate-of-incorporation.pdf", mimeType: "application/pdf", content: certificate },
      { type: "REGISTRY_FILING", title: "IN01 filing receipt", fileName: "companies-house-in01-receipt.pdf", mimeType: "application/pdf", content: receipt },
    ];
  }
}
