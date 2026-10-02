import type { CompanyStatus, DocumentType, EntityType, FilingStatus, Jurisdiction, LifecycleStage } from "@/lib/domain";
import type { Quote } from "@/lib/pricing/quote";
import type { MultiJurisdictionNameCheck, NameAvailabilityResult } from "@/lib/registry/types-public";

/** Shapes returned by the route handlers, shared with client components. */

export interface NameCheckResponse {
  result: NameAvailabilityResult;
  /** Same distinctive name in the other jurisdictions (EasyCompanies-style instant check). */
  alternatives: MultiJurisdictionNameCheck[];
}

export interface CreateFormationResponse {
  companyId: string;
  filingId: string;
  quote: Quote;
  /** Present when Stripe is configured: redirect the customer here to pay. */
  checkoutUrl?: string;
}

export interface FilingView {
  id: string;
  status: FilingStatus;
  lifecycle: LifecycleStage;
  registryReference: string | null;
  expedited: boolean;
  submittedAt: string | null;
  decidedAt: string | null;
  error: { code: string; message: string; field: string | null } | null;
  company: {
    id: string;
    name: string;
    registryNumber: string | null;
    jurisdiction: Jurisdiction;
    entityType: EntityType;
    status: CompanyStatus;
  };
  events: { id: string; status: FilingStatus; message: string; createdAt: string }[];
  documents: { id: string; type: DocumentType; title: string; source: string }[];
  payment: { status: "PENDING" | "PAID" | "EXPIRED" | "REFUNDED"; amount: number; currency: string } | null;
  settled: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown; issues?: { path?: string; field?: string; message: string }[] };
}
