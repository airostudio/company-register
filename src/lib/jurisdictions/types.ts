import type {
  ComplianceEventType,
  Country,
  Currency,
  DocumentType,
  EntityType,
  Jurisdiction,
  MinorUnits,
  OfficerRole,
  ShareClass,
} from "@/lib/domain";

/** A short explanation shown in an inline "?" tooltip next to a field. */
export interface HelpTopic {
  title: string;
  body: string;
}

export interface OfficerRequirement {
  role: OfficerRole;
  min: number;
  /** Shown in the People step when the requirement is not met. */
  message: string;
}

export interface OwnershipRules {
  /** "shares" → issued share capital; "membership" → LLC percentage interests. */
  kind: "shares" | "membership";
  shareClasses: ShareClass[];
  defaultShareClass: ShareClass;
  /** Default number of units issued at formation (for LLCs this is 100 = 100%). */
  defaultTotalUnits: number;
  /** Default issue price per unit, minor units. */
  defaultPricePerUnit: MinorUnits;
  unitLabel: { singular: string; plural: string };
  /** Holders that are allowed to change `totalUnits` (false for LLC percentages). */
  totalUnitsEditable: boolean;
}

export interface EntityTypeProfile {
  type: EntityType;
  label: string;
  shortLabel: string;
  description: string;
  /** Legal endings the registry accepts. The first one is the default. */
  suffixes: string[];
  allowedOfficerRoles: OfficerRole[];
  officerRequirements: OfficerRequirement[];
  ownership: OwnershipRules;
  /** Documents auto-generated in the formation pack. */
  documentPack: DocumentType[];
  governmentFee: MinorUnits;
  /** Extra government fee for registry-level expedited handling, if offered. */
  governmentExpediteFee?: MinorUnits;
  processingTime: { standard: string; expedited?: string };
  popular?: boolean;
}

export interface AddressRules {
  regionLabel: string;
  regions: { code: string; name: string }[];
  postcodeLabel: string;
  postcodePattern: RegExp;
  postcodeExample: string;
  /** Registered office must be a physical street address (no PO boxes). */
  requiresPhysicalAddress: boolean;
  /** Registered office must be located in this region (e.g. Delaware for US_DE). */
  requiredRegion?: string;
  /** Distinguishes the registered office from the principal place of business (AU). */
  hasPrincipalPlaceOfBusiness: boolean;
  /** A commercial registered agent is legally required unless the customer has an in-state address. */
  registeredAgent: "required" | "optional" | "unavailable";
  virtualOfficeAvailable: boolean;
}

export interface PeopleRules {
  /** At least one director must ordinarily reside in this country (AU: s201A Corporations Act). */
  residentDirectorCountry?: Country;
  directorMinimumAge?: number;
  requiresDirectorId: boolean;
  requiresPlaceOfBirth: boolean;
  requiresDateOfBirth: boolean;
  beneficialOwnership: {
    label: string;
    shortLabel: string;
    /** Individuals holding at least this % must be declared. */
    thresholdPercent: number;
    required: boolean;
    natureOfControlOptions: { value: string; label: string }[];
  };
}

export interface ComplianceRule {
  type: ComplianceEventType;
  title: string;
  description: string;
  /** How to compute the due date for year N (1-based) after incorporation. */
  schedule:
    | { kind: "anniversary"; offsetDays?: number }
    | { kind: "fixed-date"; month: number; day: number }
    | { kind: "months-after-incorporation"; months: number; thenYearly: boolean };
  feeEstimate?: MinorUnits;
  appliesTo?: EntityType[];
}

export interface JurisdictionProfile {
  code: Jurisdiction;
  country: Country;
  name: string;
  shortName: string;
  flag: string;
  currency: Currency;
  registry: { code: string; name: string; url: string };
  identifiers: { companyNumber: string; taxId: string; taxIdDescription: string };
  entityTypes: EntityTypeProfile[];
  address: AddressRules;
  people: PeopleRules;
  requiresSicCodes: boolean;
  /** Sales tax applied to platform service fees (government fees are exempt). */
  serviceTax?: { label: string; rate: number };
  compliance: ComplianceRule[];
  help: Record<string, HelpTopic>;
}
