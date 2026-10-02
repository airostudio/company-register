import type { EntityType, Jurisdiction, OfficerRole } from "@/lib/domain";
import { composeCompanyName, getEntityProfile } from "@/lib/jurisdictions";
import { ADDRESS_SERVICE_PROVIDERS } from "@/lib/jurisdictions/service-providers";
import type { DocumentContext } from "./types";

/**
 * Fixed sample company used to fingerprint template wording and to render
 * previews for legal reviewers. Never change it casually: doing so changes
 * every fingerprint and invalidates recorded reviews.
 */
export function sampleDocumentContext(jurisdiction: Jurisdiction, entityType: EntityType): DocumentContext {
  const entity = getEntityProfile(jurisdiction, entityType);
  const address = ADDRESS_SERVICE_PROVIDERS[jurisdiction].address;
  const roles: OfficerRole[] = entity.officerRequirements.map((r) => r.role);
  const total = entity.ownership.defaultTotalUnits;
  return {
    company: {
      name: composeCompanyName("Sample Holdings", entity.suffixes[0]!),
      registryNumber: "SAMPLE-0001",
      jurisdiction,
      entityType,
      incorporatedAt: "2026-01-01T00:00:00.000Z",
      registeredOffice: address,
      registeredAgentName: jurisdiction.startsWith("US") ? ADDRESS_SERVICE_PROVIDERS[jurisdiction].name : undefined,
      businessActivity: "Any lawful business activity",
      sicCodes: jurisdiction === "UK" ? ["62012"] : [],
    },
    officers: [{ fullName: "Alex Example", roles, residentialAddress: address, dateOfBirth: "1990-01-01" }],
    shareholders: [
      { fullName: "Alex Example", holderType: "INDIVIDUAL", address, shareClass: entity.ownership.defaultShareClass, units: total / 2, pricePerUnit: entity.ownership.defaultPricePerUnit, beneficiallyHeld: true, certificateNumber: 1 },
      { fullName: "Sam Sample", holderType: "INDIVIDUAL", address, shareClass: entity.ownership.defaultShareClass, units: total / 2, pricePerUnit: entity.ownership.defaultPricePerUnit, beneficiallyHeld: true, certificateNumber: 2 },
    ],
    totalUnits: total,
    beneficialOwners: [],
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}
