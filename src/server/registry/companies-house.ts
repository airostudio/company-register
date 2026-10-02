import type { Jurisdiction } from "@/lib/domain";
import {
  RegistryError,
  type FilingReceipt,
  type FilingStatusResult,
  type FormationPayload,
  type IGovernmentRegistryAdapter,
  type NameAvailabilityResult,
  type NameCheckOptions,
  type OfficialDocument,
} from "@/lib/registry/types";
import { AssistedLodgementAdapter } from "./assisted";
import {
  GatewayError,
  documentBody,
  envelope,
  gatewayConfigFromEnv,
  incorporationBody,
  missingForElectronicFiling,
  newSubmissionNumber,
  parseDocument,
  parseSubmissionStatus,
  send,
  statusBody,
  type GatewayConfig,
} from "./companies-house-gateway";
import type { NameSearchProvider } from "./name-search";

const PREFIX = "CH-XML-";
type Fetch = typeof fetch;

/**
 * Live Companies House adapter.
 * - Names: Companies House search API (+ our own register).
 * - Lodgement: XML Gateway electronic incorporation when enabled and every
 *   director/PSC has a personal code; otherwise staff lodge it (assisted).
 */
export class CompaniesHouseLiveAdapter implements IGovernmentRegistryAdapter {
  readonly registryCode = "CH";
  readonly jurisdictions: readonly Jurisdiction[] = ["UK"];
  private readonly assisted: AssistedLodgementAdapter;

  constructor(
    nameSearch: NameSearchProvider[],
    private readonly gateway: GatewayConfig | undefined = gatewayConfigFromEnv(),
    private readonly fetchImpl: Fetch = fetch,
  ) {
    this.assisted = new AssistedLodgementAdapter("CH", ["UK"], nameSearch);
  }

  ownsReference(reference: string): boolean {
    return reference.startsWith(PREFIX) || this.assisted.ownsReference(reference);
  }

  checkNameAvailability(name: string, jurisdiction: Jurisdiction, options?: NameCheckOptions): Promise<NameAvailabilityResult> {
    return this.assisted.checkNameAvailability(name, jurisdiction, options);
  }

  async submitFiling(payload: FormationPayload): Promise<FilingReceipt> {
    if (!this.gateway || missingForElectronicFiling(payload).length > 0) {
      return this.assisted.submitFiling(payload);
    }
    const submissionNumber = newSubmissionNumber();
    try {
      await send(this.gateway, envelope(this.gateway, "CompanyIncorporation", incorporationBody(payload, this.gateway, submissionNumber)), this.fetchImpl);
    } catch (error) {
      throw this.toRegistryError(error);
    }
    const now = new Date();
    return {
      filingId: `${PREFIX}${submissionNumber}`,
      status: "SUBMITTED",
      submittedAt: now.toISOString(),
      estimatedDecisionAt: new Date(now.getTime() + (payload.expedited ? 6 : 24) * 3600_000).toISOString(),
      message: `Submitted to Companies House electronically (submission ${submissionNumber}).`,
    };
  }

  async pollFilingStatus(filingId: string): Promise<FilingStatusResult> {
    if (!filingId.startsWith(PREFIX)) return this.assisted.pollFilingStatus(filingId);
    const status = await this.fetchStatus(filingId);
    const updatedAt = new Date().toISOString();
    switch (status.statusCode) {
      case "ACCEPT":
        if (!status.incorporation?.companyNumber) {
          return { filingId, status: "UNDER_REVIEW", message: "Accepted — waiting for the company number.", updatedAt, nextPollInMs: 10 * 60_000 };
        }
        return {
          filingId,
          status: "APPROVED",
          message: "Incorporated by Companies House.",
          updatedAt,
          registration: {
            registryNumber: status.incorporation.companyNumber,
            incorporatedAt: new Date(status.incorporation.incorporationDate || updatedAt).toISOString(),
          },
        };
      case "REJECT":
        return {
          filingId,
          status: "REJECTED",
          message: "Companies House rejected the application.",
          updatedAt,
          issues: status.rejections.map((r) => ({ code: "VALIDATION_FAILED" as const, message: `${r.code}: ${r.description}` })),
        };
      case "PARKED":
        return {
          filingId,
          status: "REQUIRES_ACTION",
          message: status.examinerComment ?? "Companies House has queried the application.",
          updatedAt,
          issues: [{ code: "REQUISITION", message: status.examinerComment ?? "Examiner query" }],
        };
      default:
        return { filingId, status: "UNDER_REVIEW", message: "Companies House is processing the application.", updatedAt, nextPollInMs: 10 * 60_000 };
    }
  }

  async downloadOfficialDocuments(filingId: string): Promise<OfficialDocument[]> {
    if (!filingId.startsWith(PREFIX)) return this.assisted.downloadOfficialDocuments(filingId);
    const status = await this.fetchStatus(filingId);
    const key = status.incorporation?.docRequestKey;
    if (status.statusCode !== "ACCEPT" || !key) throw new RegistryError("CH", "NOT_READY", "The certificate isn't available yet");
    try {
      const xml = await send(this.gateway!, envelope(this.gateway!, "GetDocument", documentBody(key)), this.fetchImpl);
      return [
        {
          type: "CERTIFICATE_OF_INCORPORATION",
          title: "Companies House Certificate of Incorporation",
          fileName: "companies-house-certificate-of-incorporation.pdf",
          mimeType: "application/pdf",
          content: parseDocument(xml),
        },
      ];
    } catch (error) {
      throw this.toRegistryError(error);
    }
  }

  private async fetchStatus(filingId: string) {
    if (!this.gateway) throw new RegistryError("CH", "SERVICE_UNAVAILABLE", "Companies House XML Gateway is not configured");
    try {
      const xml = await send(this.gateway, envelope(this.gateway, "GetSubmissionStatus", statusBody(this.gateway, filingId.slice(PREFIX.length))), this.fetchImpl);
      return parseSubmissionStatus(xml);
    } catch (error) {
      throw this.toRegistryError(error);
    }
  }

  private toRegistryError(error: unknown): RegistryError {
    if (error instanceof RegistryError) return error;
    if (error instanceof GatewayError) return new RegistryError("CH", error.retryable ? "SERVICE_UNAVAILABLE" : "VALIDATION_FAILED", error.message);
    return new RegistryError("CH", "SERVICE_UNAVAILABLE", error instanceof Error ? error.message : String(error));
  }
}
