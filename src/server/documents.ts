import type { Prisma } from "@prisma/client";
import type { OfficerRole } from "@/lib/domain";
import type { DocumentContext } from "@/lib/documents";
import type { Address } from "@/lib/validation/address";

export type CompanyWithPeople = Prisma.CompanyGetPayload<{
  include: { officers: true; shareholders: true; beneficialOwners: true };
}>;

/** Build a document template context from persisted company records. */
export function documentContextFromCompany(company: CompanyWithPeople): DocumentContext {
  const officers = company.officers
    .filter((o) => !o.ceasedAt)
    .map((o) => ({
      fullName: o.fullName,
      roles: o.roles as OfficerRole[],
      residentialAddress: o.residentialAddress as unknown as Address,
      dateOfBirth: o.dateOfBirth?.toISOString().slice(0, 10),
      placeOfBirth: o.placeOfBirth ?? undefined,
      directorId: o.directorId ?? undefined,
    }));

  const totalUnits =
    (company.jurisdictionData as { totalUnits?: number } | null)?.totalUnits ??
    company.shareholders.reduce((acc, s) => acc + s.shareCount, 0);

  return {
    company: {
      name: company.legalName ?? company.proposedName,
      registryNumber: company.registryNumber ?? undefined,
      jurisdiction: company.jurisdiction,
      entityType: company.entityType,
      incorporatedAt: company.incorporatedAt?.toISOString(),
      registeredOffice: company.registeredAddress as unknown as Address,
      registeredAgentName: company.registeredAgentName ?? undefined,
      principalAddress: (company.principalAddress as unknown as Address | null) ?? undefined,
      businessActivity: company.businessActivity ?? undefined,
      sicCodes: company.sicCodes,
      taxId: company.taxId ?? undefined,
    },
    officers,
    shareholders: company.shareholders
      .sort((a, b) => (a.certificateNumber ?? 0) - (b.certificateNumber ?? 0))
      .map((s) => ({
        fullName: s.fullName,
        holderType: s.holderType === "CORPORATE" ? "CORPORATE" : "INDIVIDUAL",
        address: s.address as unknown as Address,
        shareClass: s.shareClass,
        units: s.shareCount,
        pricePerUnit: s.pricePerShare.toNumber(),
        beneficiallyHeld: s.beneficiallyHeld,
        certificateNumber: s.certificateNumber ?? undefined,
      })),
    totalUnits,
    beneficialOwners: company.beneficialOwners.map((b) => ({
      fullName: b.fullName,
      ownershipPercent: b.ownershipPercent.toNumber(),
      natureOfControl: b.natureOfControl,
    })),
    generatedAt: new Date().toISOString(),
  };
}
