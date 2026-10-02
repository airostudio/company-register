import { renderFilingReceipt, renderRegistryCertificate } from "@/lib/documents";
import type { Jurisdiction } from "@/lib/domain";
import { getEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import type { Address } from "@/lib/validation/address";
import type { FilingStatusResult, FormationPayload, OfficialDocument, RegistryIssue } from "../types";
import { MockRegistryAdapter } from "./simulator";

/** ZIP ranges for the formation states (first 3 digits), used to simulate SoS address checks. */
const ZIP3_RANGES: Record<string, [number, number]> = {
  DE: [197, 199],
  WY: [820, 831],
};

export function isPlausibleZip(state: string, zip: string): boolean {
  if (!/^\d{5}(-\d{4})?$/.test(zip) || zip.startsWith("00000")) return false;
  const range = ZIP3_RANGES[state];
  if (!range) return true;
  const zip3 = Number(zip.slice(0, 3));
  return zip3 >= range[0] && zip3 <= range[1];
}

const STATUTES: Record<string, { LLC: string; CORP: string; registry: string }> = {
  US_DE: {
    LLC: "the Delaware Limited Liability Company Act",
    CORP: "the General Corporation Law of the State of Delaware",
    registry: "Delaware Division of Corporations",
  },
  US_WY: {
    LLC: "the Wyoming Limited Liability Company Act",
    CORP: "the Wyoming Business Corporation Act",
    registry: "Wyoming Secretary of State",
  },
};

/** Simulates US Secretary of State online filing systems (Delaware & Wyoming). */
export class MockUsSecretaryOfStateAdapter extends MockRegistryAdapter {
  readonly registryCode = "US-SOS";
  readonly jurisdictions: readonly Jurisdiction[] = ["US_DE", "US_WY"];

  protected readonly timeline = {
    toUnderReviewMs: 8_000,
    toDecisionMs: 30_000,
    expeditedFactor: 0.3,
    nameSearchLatencyMs: 350,
  };

  protected readonly takenNames = [
    { name: "Acme LLC", number: "7000001" },
    { name: "Acme Inc.", number: "7000002" },
    { name: "Rocket Ventures LLC", number: "7000003" },
    { name: "Blue Harbor Capital Inc.", number: "7000004" },
    { name: "Cowboy Coffee LLC", number: "2020-000123456" },
    { name: "Northwind Traders Inc.", number: "7000005" },
  ];


  protected validateLodgement(payload: FormationPayload): RegistryIssue[] {
    const issues: RegistryIssue[] = [];
    const state = payload.jurisdiction === "US_DE" ? "DE" : "WY";
    const office = payload.registeredOffice;
    if (office.country !== "US" || office.region !== state) {
      issues.push({
        code: "INVALID_ADDRESS",
        field: "registeredOffice",
        message: `The registered office must be a physical address in ${getJurisdiction(payload.jurisdiction).shortName}.`,
      });
    }
    const checkZip = (address: Address | undefined, field: string) => {
      if (address?.country === "US" && !isPlausibleZip(address.region, address.postcode)) {
        issues.push({
          code: "INVALID_POSTAL_CODE",
          field: `${field}.postcode`,
          message: `ZIP code ${address.postcode} is not valid for ${address.region}.`,
        });
      }
    };
    checkZip(office, "registeredOffice");
    checkZip(payload.principalPlaceOfBusiness, "principalPlaceOfBusiness");
    return issues;
  }

  protected formatRegistryNumber(seed: number, incorporatedAt: Date, jurisdiction: Jurisdiction): string {
    if (jurisdiction === "US_WY") {
      return `${incorporatedAt.getUTCFullYear()}-${String(seed % 1_000_000_000).padStart(9, "0")}`;
    }
    return String(1_000_000 + (seed % 9_000_000));
  }

  protected async renderOfficialDocuments(
    payload: FormationPayload,
    registration: NonNullable<FilingStatusResult["registration"]>,
  ): Promise<OfficialDocument[]> {
    const statutes = STATUTES[payload.jurisdiction]!;
    const isLlc = payload.entityType === "US_LLC";
    const entity = getEntityProfile(payload.jurisdiction, payload.entityType);
    const profile = getJurisdiction(payload.jurisdiction);
    const name = registration.legalName ?? payload.companyName;
    const certTitle = isLlc ? "Certificate of Formation" : "Certificate of Incorporation";

    const [certificate, receipt] = await Promise.all([
      renderRegistryCertificate({
        registryName: statutes.registry,
        statute: isLlc ? statutes.LLC : statutes.CORP,
        companyName: name,
        numberLabel: profile.identifiers.companyNumber,
        registryNumber: registration.registryNumber,
        entityLabel: entity.label,
        jurisdictionName: `the State of ${profile.shortName}`,
        incorporatedAt: registration.incorporatedAt,
        filingReference: payload.clientReference,
      }),
      renderFilingReceipt({
        registryName: statutes.registry,
        formName: `${certTitle} — filed copy`,
        companyName: name,
        filingReference: payload.clientReference,
        lodgedAt: registration.incorporatedAt,
        lodger: `${payload.lodger.name} via GlobalCorp Hub`,
        lines: [
          [profile.identifiers.companyNumber, registration.registryNumber],
          ["Registered agent", payload.registeredAgent?.name ?? "Self"],
          ["Service", payload.expedited ? "Expedited" : "Standard"],
        ],
      }),
    ]);
    return [
      { type: "CERTIFICATE_OF_INCORPORATION", title: `${profile.shortName} ${certTitle}`, fileName: `${profile.shortName.toLowerCase()}-${isLlc ? "certificate-of-formation" : "certificate-of-incorporation"}.pdf`, mimeType: "application/pdf", content: certificate },
      { type: "REGISTRY_FILING", title: `${profile.shortName} filing evidence`, fileName: `${profile.shortName.toLowerCase()}-filing-evidence.pdf`, mimeType: "application/pdf", content: receipt },
    ];
  }
}
