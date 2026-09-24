import type { DocumentType, EntityType, Jurisdiction, OfficerRole, ShareClass } from "@/lib/domain";
import type { Address } from "@/lib/validation/address";

/** Everything a document template needs; built from the DB or a FormationPayload. */
export interface DocumentContext {
  company: {
    name: string;
    registryNumber?: string;
    jurisdiction: Jurisdiction;
    entityType: EntityType;
    incorporatedAt?: string;
    registeredOffice: Address;
    registeredAgentName?: string;
    principalAddress?: Address;
    businessActivity?: string;
    sicCodes?: string[];
    taxId?: string;
  };
  officers: {
    fullName: string;
    roles: OfficerRole[];
    residentialAddress: Address;
    dateOfBirth?: string;
    placeOfBirth?: string;
    directorId?: string;
  }[];
  shareholders: {
    fullName: string;
    holderType: "INDIVIDUAL" | "CORPORATE";
    address: Address;
    shareClass: ShareClass;
    units: number;
    /** Minor units. */
    pricePerUnit: number;
    beneficiallyHeld: boolean;
    certificateNumber?: number;
  }[];
  totalUnits: number;
  beneficialOwners: { fullName: string; ownershipPercent: number; natureOfControl: string[] }[];
  generatedAt: string;
}

export interface GeneratedDocument {
  type: DocumentType;
  title: string;
  fileName: string;
  mimeType: "application/pdf";
  content: Uint8Array;
}
