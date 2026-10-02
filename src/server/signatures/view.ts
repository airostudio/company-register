import type { SignatureRequest } from "@prisma/client";
import { consentStatements } from "@/lib/documents";
import { OFFICER_ROLE_LABELS, type OfficerRole } from "@/lib/domain";
import { getJurisdiction } from "@/lib/jurisdictions";
import { db } from "../db";
import { documentContextFromCompany } from "../documents";

export interface SigningViewModel {
  id: string;
  status: SignatureRequest["status"];
  expired: boolean;
  companyName: string;
  jurisdictionName: string;
  registryName: string;
  signerName: string;
  roles: string;
  statements: string[];
  documentHash: string;
  signedAt: string | null;
  signedDocumentId: string | null;
}

/** Everything the signing page shows, built from the same context as the PDF. */
export async function signingViewModel(request: SignatureRequest): Promise<SigningViewModel> {
  const company = await db().company.findUniqueOrThrow({
    where: { id: request.companyId },
    include: { officers: { orderBy: { createdAt: "asc" } }, shareholders: true, beneficialOwners: true },
  });
  const ctx = documentContextFromCompany(company);
  const index = company.officers.filter((o) => !o.ceasedAt).findIndex((o) => o.id === request.officerId);
  const officer = ctx.officers[Math.max(index, 0)]!;
  const profile = getJurisdiction(company.jurisdiction);
  return {
    id: request.id,
    status: request.status,
    expired: request.status === "PENDING" && request.expiresAt < new Date(),
    companyName: company.legalName ?? company.proposedName,
    jurisdictionName: profile.name,
    registryName: profile.registry.name,
    signerName: request.signerName,
    roles: (request.roles as OfficerRole[]).map((r) => OFFICER_ROLE_LABELS[r]).join(" and "),
    statements: consentStatements(officer, ctx),
    documentHash: request.documentHash,
    signedAt: request.signedAt?.toISOString() ?? null,
    signedDocumentId: request.signedDocumentId,
  };
}
