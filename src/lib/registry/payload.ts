import { getEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import { ADDRESS_SERVICE_PROVIDERS } from "@/lib/jurisdictions/service-providers";
import { resolveAddOns } from "@/lib/pricing/quote";
import { fullCompanyName, type FormationApplication } from "@/lib/validation/formation";
import type { FormationPayload } from "./types";

/** Map a validated wizard submission to the canonical registry payload. */
export function buildFormationPayload(app: FormationApplication, clientReference: string): FormationPayload {
  const { jurisdiction, entityType } = app.entity;
  const profile = getJurisdiction(jurisdiction);
  const entity = getEntityProfile(jurisdiction, entityType);
  const provider = ADDRESS_SERVICE_PROVIDERS[jurisdiction];
  const { details, people } = app;

  const registeredOffice = details.useAddressService ? provider.address : details.registeredAddress!;
  const principal = profile.address.hasPrincipalPlaceOfBusiness
    ? details.useAddressService || !details.principalSameAsRegistered
      ? details.principalAddress
      : registeredOffice
    : undefined;

  const addOns = resolveAddOns({
    jurisdiction,
    entityType,
    addOns: app.addons.addOns,
    plan: app.addons.plan,
    useAddressService: details.useAddressService,
  });

  return {
    clientReference,
    jurisdiction,
    entityType,
    companyName: fullCompanyName(app),
    baseName: app.name.baseName.trim(),
    suffix: app.name.suffix,
    registeredOffice,
    registeredAgent: details.useAddressService ? provider : undefined,
    principalPlaceOfBusiness: principal,
    businessActivity: details.businessActivity,
    sicCodes: profile.requiresSicCodes ? details.sicCodes : [],
    officers: people.officers.map((o) => ({
      fullName: o.fullName.trim(),
      roles: o.roles,
      dateOfBirth: o.dateOfBirth || undefined,
      placeOfBirth: o.placeOfBirth || undefined,
      nationality: o.nationality || undefined,
      residentialAddress: o.residentialAddress,
      directorId: o.directorId?.replace(/\s/g, "") || undefined,
      identityVerificationCode: o.identityVerificationCode?.toUpperCase() || undefined,
    })),
    shareCapital: { totalUnits: people.totalUnits, kind: entity.ownership.kind },
    shareholders: people.shareholders.map((s) => ({
      fullName: s.fullName.trim(),
      holderType: s.holderType,
      address: s.address,
      shareClass: s.shareClass,
      units: s.units,
      pricePerUnit: s.pricePerUnit,
      beneficiallyHeld: s.beneficiallyHeld,
    })),
    beneficialOwners: people.beneficialOwners.map((b) => ({
      fullName: b.fullName.trim(),
      dateOfBirth: b.dateOfBirth || undefined,
      nationality: b.nationality || undefined,
      residentialAddress: b.residentialAddress,
      ownershipPercent: b.ownershipPercent,
      natureOfControl: b.natureOfControl,
      identityVerificationCode: b.identityVerificationCode?.toUpperCase() || undefined,
    })),
    noBeneficialOwnersStatement: people.noBeneficialOwners,
    expedited: addOns.includes("EXPEDITED"),
    lodger: { name: app.review.contactName, email: app.review.contactEmail },
  };
}
