import type { DocumentType, EntityType, FilingStatus, Jurisdiction, OfficerRole, ShareClass } from "@/lib/domain";
import type { Address } from "@/lib/validation/address";

/**
 * Canonical, registry-agnostic formation request. Built from a validated
 * wizard submission (see ./payload.ts); each adapter maps it to its
 * government's wire format.
 */
export interface FormationPayload {
  /** Our Filing.id — sent as the lodger reference so webhooks/polls can be correlated. */
  clientReference: string;
  jurisdiction: Jurisdiction;
  entityType: EntityType;
  companyName: string;
  baseName: string;
  suffix: string;
  registeredOffice: Address;
  /** Present when a commercial registered agent / registered office provider is used. */
  registeredAgent?: { name: string; address: Address };
  principalPlaceOfBusiness?: Address;
  businessActivity: string;
  sicCodes: string[];
  officers: {
    fullName: string;
    roles: OfficerRole[];
    dateOfBirth?: string;
    placeOfBirth?: string;
    nationality?: string;
    residentialAddress: Address;
    directorId?: string;
    identityVerificationCode?: string;
  }[];
  shareCapital: { totalUnits: number; kind: "shares" | "membership" };
  shareholders: {
    fullName: string;
    holderType: "INDIVIDUAL" | "CORPORATE";
    address: Address;
    shareClass: ShareClass;
    units: number;
    pricePerUnit: number;
    beneficiallyHeld: boolean;
  }[];
  beneficialOwners: {
    fullName: string;
    dateOfBirth?: string;
    nationality?: string;
    residentialAddress: Address;
    ownershipPercent: number;
    natureOfControl: string[];
    identityVerificationCode?: string;
  }[];
  noBeneficialOwnersStatement: boolean;
  expedited: boolean;
  lodger: { name: string; email: string };
}

export type NameIssueCode =
  | "IDENTICAL_NAME"
  | "SIMILAR_NAME"
  | "RESTRICTED_WORD"
  | "INVALID_CHARACTERS"
  | "MISSING_LEGAL_ENDING"
  | "TOO_SHORT"
  /** The live register couldn't be searched; staff confirm availability before lodging. */
  | "UNVERIFIED";

export interface NameIssue {
  code: NameIssueCode;
  severity: "error" | "warning";
  message: string;
}

export interface NameAvailabilityResult {
  query: string;
  normalizedName: string;
  jurisdiction: Jurisdiction;
  registry: string;
  status: "AVAILABLE" | "UNAVAILABLE" | "INVALID";
  available: boolean;
  issues: NameIssue[];
  conflicts: { name: string; registryNumber: string; similarity: number }[];
  /** Alternative names that *are* available (only when unavailable). */
  suggestions: string[];
  checkedAt: string;
}

export interface NameCheckOptions {
  entityType?: EntityType;
  /** Skip suggestion generation (used when checking suggestions themselves). */
  suggest?: boolean;
}

/** Statuses a registry can report after accepting a lodgement. */
export type RegistryFilingStatus = Extract<
  FilingStatus,
  "SUBMITTED" | "UNDER_REVIEW" | "REQUIRES_ACTION" | "APPROVED" | "REJECTED"
>;

export interface RegistryIssue {
  code: RegistryErrorCode;
  message: string;
  /** Dot-path into FormationPayload, when the problem maps to a field. */
  field?: string;
}

export interface FilingReceipt {
  /** The registry's reference for this lodgement. */
  filingId: string;
  status: RegistryFilingStatus;
  submittedAt: string;
  estimatedDecisionAt: string;
  message: string;
}

export interface FilingStatusResult {
  filingId: string;
  status: RegistryFilingStatus;
  message: string;
  updatedAt: string;
  /** Suggested wait before polling again; undefined once terminal. */
  nextPollInMs?: number;
  /** Populated when APPROVED. */
  registration?: {
    registryNumber: string;
    legalName?: string;
    incorporatedAt: string;
  };
  issues?: RegistryIssue[];
}

export interface OfficialDocument {
  type: DocumentType;
  title: string;
  fileName: string;
  mimeType: string;
  content: Uint8Array;
}

/**
 * Standardized gateway every government registry integration implements.
 * Real adapters wrap ASIC's EDGE/ABR APIs, state SoS portals and the Companies
 * House XML Gateway; mock adapters simulate them for development and tests.
 */
export interface IGovernmentRegistryAdapter {
  readonly registryCode: string;
  readonly jurisdictions: readonly Jurisdiction[];

  checkNameAvailability(
    name: string,
    jurisdiction: Jurisdiction,
    options?: NameCheckOptions,
  ): Promise<NameAvailabilityResult>;

  /** Lodge a formation. Throws RegistryError when the registry rejects it outright. */
  submitFiling(payload: FormationPayload): Promise<FilingReceipt>;

  pollFilingStatus(filingId: string): Promise<FilingStatusResult>;

  /** Registry-issued documents (certificate, stamped filing). Only after approval. */
  downloadOfficialDocuments(filingId: string): Promise<OfficialDocument[]>;

  /** Whether a reference returned by submitFiling belongs to this adapter (references are self-describing). */
  ownsReference(reference: string): boolean;
}

export type RegistryErrorCode =
  | "NAME_CONFLICT"
  | "RESTRICTED_NAME"
  | "INVALID_POSTAL_CODE"
  | "INVALID_ADDRESS"
  | "INVALID_OFFICER"
  | "VALIDATION_FAILED"
  | "REQUISITION"
  | "NOT_FOUND"
  | "NOT_READY"
  | "UNSUPPORTED_JURISDICTION"
  | "SERVICE_UNAVAILABLE";

const RETRYABLE: ReadonlySet<RegistryErrorCode> = new Set(["SERVICE_UNAVAILABLE", "NOT_READY"]);

export class RegistryError extends Error {
  readonly code: RegistryErrorCode;
  readonly registryCode: string;
  readonly issues: RegistryIssue[];
  readonly retryable: boolean;

  constructor(registryCode: string, code: RegistryErrorCode, message: string, issues: RegistryIssue[] = []) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
    this.registryCode = registryCode;
    this.issues = issues.length ? issues : [{ code, message }];
    this.retryable = RETRYABLE.has(code);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      registry: this.registryCode,
      message: this.message,
      issues: this.issues,
      retryable: this.retryable,
    };
  }
}

export function isRegistryError(error: unknown): error is RegistryError {
  return error instanceof RegistryError;
}
