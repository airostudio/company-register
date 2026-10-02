/**
 * Core domain vocabulary shared by client and server code.
 *
 * These mirror the Prisma enums in prisma/schema.prisma so that client
 * components never need to import @prisma/client. domain.test.ts asserts the
 * two stay in sync.
 */

export const JURISDICTIONS = ["AU", "US_DE", "US_WY", "UK"] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

export const COUNTRIES = ["AU", "US", "UK"] as const;
export type Country = (typeof COUNTRIES)[number];

export const ENTITY_TYPES = ["AU_PTY_LTD", "US_LLC", "US_C_CORP", "UK_LTD"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const OFFICER_ROLES = [
  "DIRECTOR",
  "SECRETARY",
  "MANAGER",
  "PRESIDENT",
  "TREASURER",
  "ORGANIZER",
] as const;
export type OfficerRole = (typeof OFFICER_ROLES)[number];

export const SHARE_CLASSES = ["ORDINARY", "COMMON", "PREFERRED", "MEMBERSHIP_INTEREST"] as const;
export type ShareClass = (typeof SHARE_CLASSES)[number];

export const FILING_STATUSES = [
  "DRAFT",
  "AWAITING_SIGNATURES",
  "QUEUED",
  "SUBMITTED",
  "UNDER_REVIEW",
  "REQUIRES_ACTION",
  "APPROVED",
  "REJECTED",
  "FAILED",
] as const;
export type FilingStatus = (typeof FILING_STATUSES)[number];

export const TERMINAL_FILING_STATUSES: readonly FilingStatus[] = ["APPROVED", "REJECTED", "FAILED"];

export function isTerminalFilingStatus(status: FilingStatus): boolean {
  return TERMINAL_FILING_STATUSES.includes(status);
}

export const COMPANY_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "ACTIVE",
  "REJECTED",
  "DEREGISTERED",
] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const DOCUMENT_TYPES = [
  "CERTIFICATE_OF_INCORPORATION",
  "CONSTITUTION",
  "BYLAWS",
  "OPERATING_AGREEMENT",
  "ARTICLES_OF_ASSOCIATION",
  "SHARE_CERTIFICATE",
  "SHAREHOLDER_REGISTER",
  "CONSENT_TO_ACT",
  "REGISTRY_FILING",
  "TAX_ID_CONFIRMATION",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const SUBSCRIPTION_PLANS = [
  "PAY_AS_YOU_GO",
  "COMPLIANCE_ESSENTIALS",
  "COMPLIANCE_PRO",
] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const COMPLIANCE_EVENT_TYPES = [
  "ANNUAL_REVIEW",
  "ANNUAL_REPORT",
  "FRANCHISE_TAX",
  "CONFIRMATION_STATEMENT",
  "REGISTERED_AGENT_RENEWAL",
  "TAX_RETURN",
] as const;
export type ComplianceEventType = (typeof COMPLIANCE_EVENT_TYPES)[number];

export const COMPLIANCE_EVENT_STATUSES = ["UPCOMING", "DUE_SOON", "OVERDUE", "COMPLETED"] as const;
export type ComplianceEventStatus = (typeof COMPLIANCE_EVENT_STATUSES)[number];

/** ISO-4217 currencies we bill in. */
export type Currency = "AUD" | "USD" | "GBP";

/** Money is always handled in integer minor units (cents / pence). */
export type MinorUnits = number;

/**
 * Customer-facing lifecycle shown on the dashboard:
 * Draft → Submitted to Registry → Under Review → Approved / Active.
 */
export const LIFECYCLE_STAGES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "ACTIVE"] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const LIFECYCLE_LABELS: Record<LifecycleStage, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted to Registry",
  UNDER_REVIEW: "Under Review",
  ACTIVE: "Approved / Active",
};

export function filingStatusToLifecycle(status: FilingStatus): LifecycleStage {
  switch (status) {
    case "DRAFT":
    case "AWAITING_SIGNATURES":
      return "DRAFT";
    case "QUEUED":
    case "SUBMITTED":
    case "FAILED":
      return "SUBMITTED";
    case "UNDER_REVIEW":
    case "REQUIRES_ACTION":
    case "REJECTED":
      return "UNDER_REVIEW";
    case "APPROVED":
      return "ACTIVE";
  }
}

export function filingStatusToCompanyStatus(status: FilingStatus): CompanyStatus {
  switch (status) {
    case "DRAFT":
    case "AWAITING_SIGNATURES":
      return "DRAFT";
    case "QUEUED":
    case "SUBMITTED":
    case "FAILED":
      return "SUBMITTED";
    case "UNDER_REVIEW":
    case "REQUIRES_ACTION":
      return "UNDER_REVIEW";
    case "APPROVED":
      return "ACTIVE";
    case "REJECTED":
      return "REJECTED";
  }
}

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  DRAFT: "Awaiting payment",
  AWAITING_SIGNATURES: "Awaiting signatures",
  QUEUED: "Queued for lodgement",
  SUBMITTED: "Submitted to registry",
  UNDER_REVIEW: "Under review",
  REQUIRES_ACTION: "Action required",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  FAILED: "Lodgement failed",
};

export const OFFICER_ROLE_LABELS: Record<OfficerRole, string> = {
  DIRECTOR: "Director",
  SECRETARY: "Secretary",
  MANAGER: "Manager",
  PRESIDENT: "President / CEO",
  TREASURER: "Treasurer / CFO",
  ORGANIZER: "Organizer",
};

export const SHARE_CLASS_LABELS: Record<ShareClass, string> = {
  ORDINARY: "Ordinary shares",
  COMMON: "Common stock",
  PREFERRED: "Preferred stock",
  MEMBERSHIP_INTEREST: "Membership interest",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CERTIFICATE_OF_INCORPORATION: "Certificate of Incorporation",
  CONSTITUTION: "Company Constitution",
  BYLAWS: "Corporate Bylaws",
  OPERATING_AGREEMENT: "Operating Agreement",
  ARTICLES_OF_ASSOCIATION: "Articles of Association",
  SHARE_CERTIFICATE: "Share Certificate",
  SHAREHOLDER_REGISTER: "Register of Members",
  CONSENT_TO_ACT: "Consent to Act",
  REGISTRY_FILING: "Registry Filing",
  TAX_ID_CONFIRMATION: "Tax ID Confirmation",
};
