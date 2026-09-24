import { renderFilingReceipt, renderRegistryCertificate } from "@/lib/documents";
import type { Jurisdiction } from "@/lib/domain";
import { getEntityProfile } from "@/lib/jurisdictions";
import type { Address } from "@/lib/validation/address";
import type { FilingStatusResult, FormationPayload, OfficialDocument, RegistryIssue } from "../types";
import { MockRegistryAdapter } from "./simulator";

/** Postcode ranges per state/territory, used to simulate ASIC's address validation. */
const AU_POSTCODE_RANGES: Record<string, [number, number][]> = {
  NSW: [[1000, 2599], [2619, 2899], [2921, 2999]],
  ACT: [[200, 299], [2600, 2618], [2900, 2920]],
  VIC: [[3000, 3999], [8000, 8999]],
  QLD: [[4000, 4999], [9000, 9999]],
  SA: [[5000, 5999]],
  WA: [[6000, 6999]],
  TAS: [[7000, 7999]],
  NT: [[800, 999]],
};

export function isValidAuPostcode(state: string, postcode: string): boolean {
  const ranges = AU_POSTCODE_RANGES[state];
  const n = Number(postcode);
  if (!ranges || !/^\d{4}$/.test(postcode)) return false;
  return ranges.some(([lo, hi]) => n >= lo && n <= hi);
}

/** ACN = 8 digits + modulus-10 check digit (weights 8..1). */
export function formatAcn(seed: number): string {
  const base = String(seed % 100_000_000).padStart(8, "0");
  const sum = base.split("").reduce((acc, d, i) => acc + Number(d) * (8 - i), 0);
  const check = (10 - (sum % 10)) % 10;
  const acn = `${base}${check}`;
  return `${acn.slice(0, 3)} ${acn.slice(3, 6)} ${acn.slice(6)}`;
}

export function isValidAcn(acn: string): boolean {
  const digits = acn.replace(/\s/g, "");
  if (!/^\d{9}$/.test(digits)) return false;
  const sum = digits
    .slice(0, 8)
    .split("")
    .reduce((acc, d, i) => acc + Number(d) * (8 - i), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[8]);
}

/** Simulates ASIC's company registration (Form 201) gateway. */
export class MockAsicAdapter extends MockRegistryAdapter {
  readonly registryCode = "ASIC";
  readonly jurisdictions: readonly Jurisdiction[] = ["AU"];

  protected readonly timeline = {
    toUnderReviewMs: 6_000,
    toDecisionMs: 20_000,
    expeditedFactor: 0.5,
    nameSearchLatencyMs: 250,
  };

  protected readonly takenNames = [
    { name: "Acme Pty Ltd", number: "600 000 002" },
    { name: "Atlassian Pty Ltd", number: "600 000 010" },
    { name: "Canva Pty Ltd", number: "600 000 029" },
    { name: "Bondi Coffee Roasters Pty Ltd", number: "600 000 037" },
    { name: "Southern Cross Logistics Pty Ltd", number: "600 000 045" },
    { name: "Koala Software Pty Ltd", number: "600 000 053" },
  ];

  protected readonly restrictedWords = [
    { word: "bank", reason: "requires APRA approval under the Banking Act 1959." },
    { word: "university", reason: "requires approval from the relevant education minister." },
    { word: "anzac", reason: "requires approval from the Minister for Veterans' Affairs." },
    { word: "royal", reason: "suggests a royal connection and requires consent." },
    { word: "chartered", reason: "suggests a professional charter and requires consent." },
  ];

  protected validateLodgement(payload: FormationPayload): RegistryIssue[] {
    const issues: RegistryIssue[] = [];
    const checkAu = (address: Address | undefined, field: string) => {
      if (address?.country === "AU" && !isValidAuPostcode(address.region, address.postcode)) {
        issues.push({
          code: "INVALID_POSTAL_CODE",
          field: `${field}.postcode`,
          message: `Postcode ${address.postcode} is not a valid postcode for ${address.region}.`,
        });
      }
    };
    checkAu(payload.registeredOffice, "registeredOffice");
    checkAu(payload.principalPlaceOfBusiness, "principalPlaceOfBusiness");
    payload.officers.forEach((o, i) => {
      checkAu(o.residentialAddress, `officers.${i}.residentialAddress`);
      if (o.roles.includes("DIRECTOR") && (!o.directorId || /^0{3}/.test(o.directorId))) {
        issues.push({
          code: "INVALID_OFFICER",
          field: `officers.${i}.directorId`,
          message: `Director ID for ${o.fullName} could not be verified with ABRS.`,
        });
      }
    });
    if (!payload.officers.some((o) => o.roles.includes("DIRECTOR") && o.residentialAddress.country === "AU")) {
      issues.push({ code: "INVALID_OFFICER", field: "officers", message: "At least one director must ordinarily reside in Australia." });
    }
    return issues;
  }

  protected formatRegistryNumber(seed: number): string {
    return formatAcn(600_000_000 + (seed % 99_999_999));
  }

  protected async renderOfficialDocuments(
    payload: FormationPayload,
    registration: NonNullable<FilingStatusResult["registration"]>,
  ): Promise<OfficialDocument[]> {
    const entity = getEntityProfile(payload.jurisdiction, payload.entityType);
    const name = registration.legalName ?? payload.companyName;
    const [certificate, receipt] = await Promise.all([
      renderRegistryCertificate({
        registryName: "Australian Securities & Investments Commission",
        statute: "the Corporations Act 2001",
        companyName: name,
        numberLabel: "ACN",
        registryNumber: registration.registryNumber,
        entityLabel: entity.label,
        jurisdictionName: "the State of " + (payload.registeredOffice.region || "New South Wales"),
        incorporatedAt: registration.incorporatedAt,
        filingReference: payload.clientReference,
      }),
      renderFilingReceipt({
        registryName: "ASIC",
        formName: "Form 201 — Application for registration as an Australian company",
        companyName: name,
        filingReference: payload.clientReference,
        lodgedAt: registration.incorporatedAt,
        lodger: `${payload.lodger.name} via GlobalCorp Hub`,
        lines: [
          ["ACN", registration.registryNumber],
          ["Directors", payload.officers.filter((o) => o.roles.includes("DIRECTOR")).map((o) => o.fullName).join(", ")],
          ["Shares issued", payload.shareCapital.totalUnits.toLocaleString("en")],
        ],
      }),
    ]);
    return [
      { type: "CERTIFICATE_OF_INCORPORATION", title: "ASIC Certificate of Registration", fileName: "asic-certificate-of-registration.pdf", mimeType: "application/pdf", content: certificate },
      { type: "REGISTRY_FILING", title: "ASIC Form 201 lodgement receipt", fileName: "asic-form-201-receipt.pdf", mimeType: "application/pdf", content: receipt },
    ];
  }
}
