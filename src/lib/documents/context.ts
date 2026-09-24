import type { FormationPayload } from "@/lib/registry/types";
import type { DocumentContext } from "./types";

/** Build a template context from the canonical lodgement payload plus registration details. */
export function documentContextFromPayload(
  payload: FormationPayload,
  registration: { registryNumber?: string; incorporatedAt?: string; legalName?: string; taxId?: string } = {},
): DocumentContext {
  return {
    company: {
      name: registration.legalName ?? payload.companyName,
      registryNumber: registration.registryNumber,
      jurisdiction: payload.jurisdiction,
      entityType: payload.entityType,
      incorporatedAt: registration.incorporatedAt,
      registeredOffice: payload.registeredOffice,
      registeredAgentName: payload.registeredAgent?.name,
      principalAddress: payload.principalPlaceOfBusiness,
      businessActivity: payload.businessActivity,
      sicCodes: payload.sicCodes,
      taxId: registration.taxId,
    },
    officers: payload.officers,
    shareholders: payload.shareholders,
    totalUnits: payload.shareCapital.totalUnits,
    beneficialOwners: payload.beneficialOwners,
    generatedAt: new Date().toISOString(),
  };
}
