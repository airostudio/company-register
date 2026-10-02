import type { Jurisdiction } from "@/lib/domain";
import { getJurisdiction } from "@/lib/jurisdictions";
import { evaluateName, type RegisterEntry } from "@/lib/registry/name-evaluation";
import { RESTRICTED_WORDS } from "@/lib/registry/restricted-words";
import {
  RegistryError,
  type FilingReceipt,
  type FilingStatusResult,
  type FormationPayload,
  type IGovernmentRegistryAdapter,
  type NameAvailabilityResult,
  type NameCheckOptions,
  type NameIssue,
  type OfficialDocument,
} from "@/lib/registry/types";
import type { DocumentType } from "@/lib/domain";
import { db } from "../db";
import { createOpsTask, type OpsTaskDocument } from "../ops/tasks";
import { storage } from "../storage";
import type { NameSearchProvider } from "./name-search";

const POLL_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Live adapter for registries without a lodgement API (ASIC for non-agents,
 * Delaware, Wyoming). Name checks query whatever registers are available;
 * lodgements become OpsTasks that staff complete in the registry's portal and
 * record in the ops console. Polling reads the task, so the rest of the
 * pipeline (tracker, approval, document pack) is identical to an API registry.
 */
export class AssistedLodgementAdapter implements IGovernmentRegistryAdapter {
  constructor(
    readonly registryCode: string,
    readonly jurisdictions: readonly Jurisdiction[],
    private readonly nameSearch: NameSearchProvider[],
  ) {}

  ownsReference(reference: string): boolean {
    return reference.startsWith(`OPS-${this.registryCode}-`);
  }

  async checkNameAvailability(name: string, jurisdiction: Jurisdiction, options: NameCheckOptions = {}): Promise<NameAvailabilityResult> {
    const results = await Promise.allSettled(this.nameSearch.map((p) => p.search(name, jurisdiction)));
    const register: RegisterEntry[] = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const authoritativeOk = this.nameSearch.some((p, i) => p.authoritative && results[i]!.status === "fulfilled");
    const extraIssues: NameIssue[] = [];
    if (!authoritativeOk) {
      results.forEach((r, i) => r.status === "rejected" && console.warn(`[registry] ${this.nameSearch[i]!.name} search failed: ${r.reason}`));
      extraIssues.push({
        code: "UNVERIFIED",
        severity: "warning",
        message: `We couldn't search the ${getJurisdiction(jurisdiction).registry.name} register automatically. Our team confirms availability before lodging.`,
      });
    }
    return evaluateName({
      query: name,
      jurisdiction,
      registryCode: this.registryCode,
      register,
      restrictedWords: RESTRICTED_WORDS[jurisdiction],
      suggest: options.suggest !== false,
      extraIssues,
    });
  }

  async submitFiling(payload: FormationPayload): Promise<FilingReceipt> {
    if (!this.jurisdictions.includes(payload.jurisdiction)) {
      throw new RegistryError(this.registryCode, "UNSUPPORTED_JURISDICTION", `${this.registryCode} does not handle ${payload.jurisdiction}`);
    }
    const prisma = db();
    // Idempotent on our filing: a retried job must not create a second task.
    const existing = await prisma.opsTask.findFirst({ where: { filingId: payload.clientReference, kind: "LODGEMENT" } });
    const filing = await prisma.filing.findUniqueOrThrow({ where: { id: payload.clientReference }, select: { companyId: true } });
    const profile = getJurisdiction(payload.jurisdiction);
    const task =
      existing ??
      (await createOpsTask({
        kind: "LODGEMENT",
        authority: this.registryCode,
        jurisdiction: payload.jurisdiction,
        companyId: filing.companyId,
        filingId: payload.clientReference,
        payload,
        summary: `Register ${payload.companyName} with ${profile.registry.name}${payload.expedited ? " (EXPEDITED)" : ""}`,
      }));
    const days = payload.expedited ? 1 : 3;
    return {
      filingId: task.reference,
      status: "SUBMITTED",
      submittedAt: task.createdAt.toISOString(),
      estimatedDecisionAt: new Date(task.createdAt.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
      message: `Queued with our ${profile.registry.code} lodgement team (reference ${task.reference}).`,
    };
  }

  async pollFilingStatus(filingId: string): Promise<FilingStatusResult> {
    const task = await db().opsTask.findUnique({ where: { reference: filingId } });
    if (!task) throw new RegistryError(this.registryCode, "NOT_FOUND", `Unknown lodgement reference ${filingId}`);
    const registry = getJurisdiction(task.jurisdiction).registry;
    const updatedAt = task.updatedAt.toISOString();
    switch (task.status) {
      case "OPEN":
      case "IN_PROGRESS":
        return { filingId, status: "SUBMITTED", message: `Our team is preparing your ${registry.code} lodgement.`, updatedAt, nextPollInMs: POLL_INTERVAL_MS };
      case "SUBMITTED":
        return {
          filingId,
          status: "UNDER_REVIEW",
          message: `Lodged with ${registry.name}${task.externalReference ? ` (reference ${task.externalReference})` : ""}. Waiting for their decision.`,
          updatedAt,
          nextPollInMs: POLL_INTERVAL_MS,
        };
      case "ACTION_REQUIRED":
        return {
          filingId,
          status: "REQUIRES_ACTION",
          message: task.message ?? `${registry.code} needs more information.`,
          updatedAt,
          issues: [{ code: "REQUISITION", message: task.message ?? "More information is required." }],
        };
      case "REJECTED":
        return {
          filingId,
          status: "REJECTED",
          message: task.message ?? `${registry.code} rejected the application.`,
          updatedAt,
          issues: [{ code: "VALIDATION_FAILED", message: task.message ?? "Rejected by the registry." }],
        };
      case "COMPLETED":
        if (!task.resultNumber || !task.resultDate) {
          throw new RegistryError(this.registryCode, "NOT_READY", `Task ${filingId} is completed without a registry number/date`);
        }
        return {
          filingId,
          status: "APPROVED",
          message: `Registered by ${registry.name}.`,
          updatedAt,
          registration: { registryNumber: task.resultNumber, incorporatedAt: task.resultDate.toISOString() },
        };
    }
  }

  async downloadOfficialDocuments(filingId: string): Promise<OfficialDocument[]> {
    const task = await db().opsTask.findUnique({ where: { reference: filingId } });
    if (!task) throw new RegistryError(this.registryCode, "NOT_FOUND", `Unknown lodgement reference ${filingId}`);
    if (task.status !== "COMPLETED") throw new RegistryError(this.registryCode, "NOT_READY", "Documents are available once the registration is recorded.");
    const docs = (task.documents as OpsTaskDocument[] | null) ?? [];
    return Promise.all(
      docs.map(async (d) => ({
        type: d.type as DocumentType,
        title: d.title,
        fileName: d.fileName,
        mimeType: "application/pdf",
        content: await storage().get(d.storageKey),
      })),
    );
  }
}
