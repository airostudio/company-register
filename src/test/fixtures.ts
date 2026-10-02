import type { EntityType, Jurisdiction } from "@/lib/domain";
import { composeCompanyName, getEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import type { Address } from "@/lib/validation/address";
import type { FormationApplication, OfficerInput } from "@/lib/validation/formation";

export const addresses = {
  sydney: { line1: "1 George Street", line2: "", city: "Sydney", region: "NSW", postcode: "2000", country: "AU" },
  melbourne: { line1: "200 Collins Street", line2: "", city: "Melbourne", region: "VIC", postcode: "3000", country: "AU" },
  wilmington: { line1: "1000 Market Street", line2: "", city: "Wilmington", region: "DE", postcode: "19801", country: "US" },
  cheyenne: { line1: "1 Capitol Avenue", line2: "", city: "Cheyenne", region: "WY", postcode: "82001", country: "US" },
  austin: { line1: "500 Congress Avenue", line2: "", city: "Austin", region: "TX", postcode: "78701", country: "US" },
  london: { line1: "10 Downing Street", line2: "", city: "London", region: "ENG", postcode: "SW1A 2AA", country: "GB" },
  berlin: { line1: "Unter den Linden 1", line2: "", city: "Berlin", region: "", postcode: "10117", country: "DE" },
} satisfies Record<string, Address>;

const REGISTERED: Record<Jurisdiction, Address> = {
  AU: addresses.sydney,
  US_DE: addresses.wilmington,
  US_WY: addresses.cheyenne,
  UK: addresses.london,
};

const RESIDENCE: Record<Jurisdiction, Address> = {
  AU: addresses.melbourne,
  US_DE: addresses.austin,
  US_WY: addresses.austin,
  UK: addresses.london,
};

export function officer(overrides: Partial<OfficerInput> & Pick<OfficerInput, "roles">): OfficerInput {
  return {
    id: `off_${Math.random().toString(36).slice(2, 8)}`,
    fullName: "Jane Citizen",
    email: "jane@example.com",
    dateOfBirth: "1990-04-12",
    placeOfBirth: "Perth, Australia",
    nationality: "AU",
    residentialAddress: addresses.melbourne,
    directorId: "036123456789012",
    consentToAct: true,
    ...overrides,
  };
}

/** A complete, valid application for the given jurisdiction/entity type. */
export function buildApplication(
  jurisdiction: Jurisdiction,
  entityType: EntityType,
  baseName = "Harbourview Robotics",
): FormationApplication {
  const entity = getEntityProfile(jurisdiction, entityType);
  const suffix = entity.suffixes[0]!;
  const roles = entity.officerRequirements.map((r) => r.role);
  const total = entity.ownership.defaultTotalUnits;
  const half = Math.floor(total / 2);
  const control = [getJurisdiction(jurisdiction).people.beneficialOwnership.natureOfControlOptions[0]!.value];

  return {
    entity: { jurisdiction, entityType },
    name: {
      baseName,
      suffix,
      availability: { checkedName: composeCompanyName(baseName, suffix), available: true, checkedAt: new Date().toISOString() },
    },
    details: {
      useAddressService: false,
      registeredAddress: REGISTERED[jurisdiction],
      principalSameAsRegistered: true,
      principalAddress: undefined,
      businessActivity: "Designing and selling warehouse automation robots",
      sicCodes: jurisdiction === "UK" ? ["62012"] : [],
      registeredEmail: jurisdiction === "UK" ? "company@example.com" : "",
      lawfulPurposeConfirmed: jurisdiction === "UK",
    },
    people: {
      officers: [officer({ id: "off_1", roles, residentialAddress: RESIDENCE[jurisdiction] })],
      totalUnits: total,
      shareholders: [
        {
          id: "sh_1",
          holderType: "INDIVIDUAL",
          fullName: "Jane Citizen",
          email: "",
          address: RESIDENCE[jurisdiction],
          shareClass: entity.ownership.defaultShareClass,
          units: half,
          pricePerUnit: entity.ownership.defaultPricePerUnit,
          beneficiallyHeld: true,
        },
        {
          id: "sh_2",
          holderType: "INDIVIDUAL",
          fullName: "Sam Partner",
          email: "",
          address: RESIDENCE[jurisdiction],
          shareClass: entity.ownership.defaultShareClass,
          units: total - half,
          pricePerUnit: entity.ownership.defaultPricePerUnit,
          beneficiallyHeld: true,
        },
      ],
      beneficialOwners: [
        {
          id: "bo_1",
          fullName: "Jane Citizen",
          dateOfBirth: "1990-04-12",
          nationality: "AU",
          residentialAddress: RESIDENCE[jurisdiction],
          ownershipPercent: 50,
          natureOfControl: control,
        },
        {
          id: "bo_2",
          fullName: "Sam Partner",
          dateOfBirth: "1988-01-02",
          nationality: "AU",
          residentialAddress: RESIDENCE[jurisdiction],
          ownershipPercent: 50,
          natureOfControl: control,
        },
      ],
      noBeneficialOwners: false,
    },
    addons: { addOns: ["TAX_ID"], plan: "PAY_AS_YOU_GO" },
    review: { contactName: "Jane Citizen", contactEmail: "jane@example.com", confirmAccuracy: true, acceptTerms: true },
  };
}
