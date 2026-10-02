import type { Filing, Prisma } from "@prisma/client";
import { buildComplianceSchedule } from "@/lib/compliance/calendar";
import { generateDocumentPack } from "@/lib/documents";
import { filingStatusToCompanyStatus, isTerminalFilingStatus, type FilingStatus } from "@/lib/domain";
import {
  getRegistryAdapter,
  getRegistryAdapterForReference,
  isRegistryError,
  type FilingStatusResult,
  type FormationPayload,
} from "@/lib/registry";
import { db, toJson } from "../db";
import { documentContextFromCompany } from "../documents";
import { sendEmail } from "../email";
import { layout } from "../email/templates";
import { documentKey, storage } from "../storage";
import { appUrl } from "../urls";

/**
 * Lodgement service: moves an incorporation Filing through the registry.
 * Every function is idempotent so background-job retries (Inngest) and the
 * inline poll-on-read fallback can call them safely and concurrently.
 */

/** Statuses after which we stop polling the registry (REQUIRES_ACTION waits on the customer). */
export function isSettled(status: FilingStatus): boolean {
  return isTerminalFilingStatus(status) || status === "REQUIRES_ACTION";
}

export interface SyncResult {
  status: FilingStatus;
  settled: boolean;
  nextPollInMs?: number;
}

/**
 * Compare-and-set status transition: only applies if the filing is still in
 * `from`, so two concurrent pollers can't both record the same transition.
 */
export async function transition(
  filing: Pick<Filing, "id" | "companyId" | "type">,
  from: FilingStatus,
  to: FilingStatus,
  message: string,
  data: Prisma.FilingUpdateManyMutationInput = {},
  metadata?: unknown,
): Promise<boolean> {
  const prisma = db();
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.filing.updateMany({ where: { id: filing.id, status: from }, data: { ...data, status: to } });
    if (count === 0) return false;
    await tx.filingEvent.create({
      data: { filingId: filing.id, status: to, message, metadata: metadata === undefined ? undefined : toJson(metadata) },
    });
    // Only the incorporation filing drives the company's lifecycle status.
    if (filing.type === "INCORPORATION") {
      await tx.company.update({ where: { id: filing.companyId }, data: { status: filingStatusToCompanyStatus(to) } });
    }
    return true;
  });
}

/** Submit a QUEUED filing to its registry. Throws on retryable registry errors. */
export async function lodgeFiling(filingId: string): Promise<SyncResult> {
  const filing = await db().filing.findUniqueOrThrow({ where: { id: filingId } });
  if (filing.status !== "QUEUED" || filing.registryReference) {
    return { status: filing.status, settled: isSettled(filing.status) };
  }

  const payload = filing.requestPayload as unknown as FormationPayload;
  const adapter = getRegistryAdapter(filing.jurisdiction);
  try {
    const receipt = await adapter.submitFiling(payload);
    await transition(filing, "QUEUED", "SUBMITTED", receipt.message, {
      registryReference: receipt.filingId,
      submittedAt: new Date(receipt.submittedAt),
      responsePayload: toJson(receipt),
      errorCode: null,
      errorMessage: null,
      errorField: null,
    }, { estimatedDecisionAt: receipt.estimatedDecisionAt });
    return { status: "SUBMITTED", settled: false, nextPollInMs: 2_000 };
  } catch (error) {
    if (isRegistryError(error) && !error.retryable) {
      // The registry refused the lodgement (name conflict, bad postcode…) — the customer needs to fix it.
      const primary = error.issues[0];
      await transition(filing, "QUEUED", "REQUIRES_ACTION", error.message, {
        errorCode: error.code,
        errorMessage: error.message,
        errorField: primary?.field ?? null,
        responsePayload: toJson(error.toJSON()),
      }, { issues: error.issues });
      await notifyCustomer(filing.id, "REQUIRES_ACTION", error.message);
      return { status: "REQUIRES_ACTION", settled: true };
    }
    throw error;
  }
}

/** Mark a filing FAILED after the job runner exhausted its retries. */
export async function failFiling(filingId: string, reason: string): Promise<void> {
  const filing = await db().filing.findUnique({ where: { id: filingId } });
  if (!filing || isSettled(filing.status)) return;
  await transition(filing, filing.status, "FAILED", `Lodgement failed: ${reason}`, { errorCode: "LODGEMENT_FAILED", errorMessage: reason });
}

/**
 * Poll the registry once and record any status change.
 * `resume` also re-polls a REQUIRES_ACTION filing (e.g. after staff resolved a requisition).
 */
export async function syncFilingStatus(filingId: string, opts: { resume?: boolean } = {}): Promise<SyncResult> {
  const prisma = db();
  const filing = await prisma.filing.findUniqueOrThrow({ where: { id: filingId } });
  const skip = isTerminalFilingStatus(filing.status) || (filing.status === "REQUIRES_ACTION" && !opts.resume);
  if (!filing.registryReference || skip) {
    return { status: filing.status, settled: isSettled(filing.status) };
  }

  const result = await getRegistryAdapterForReference(filing.registryReference).pollFilingStatus(filing.registryReference);
  await prisma.filing.update({
    where: { id: filing.id },
    data: { lastPolledAt: new Date(), pollAttempts: { increment: 1 } },
  });

  if (result.status !== filing.status) {
    if (result.status === "APPROVED") {
      await recordApproval(filing, result);
    } else {
      const issue = result.issues?.[0];
      await transition(filing, filing.status, result.status, result.message, {
        decidedAt: result.status === "REJECTED" ? new Date(result.updatedAt) : undefined,
        errorCode: issue?.code ?? null,
        errorMessage: issue?.message ?? null,
        errorField: issue?.field ?? null,
        responsePayload: toJson(result),
      }, result.issues ? { issues: result.issues } : undefined);
      if (result.status === "REQUIRES_ACTION" || result.status === "REJECTED") await notifyCustomer(filing.id, result.status, result.message);
    }
  }
  return { status: result.status, settled: isSettled(result.status), nextPollInMs: result.nextPollInMs };
}

async function recordApproval(filing: Filing, result: FilingStatusResult) {
  const registration = result.registration!;
  const applied = await transition(filing, filing.status, "APPROVED", result.message, {
    decidedAt: new Date(registration.incorporatedAt),
    responsePayload: toJson(result),
  }, { registryNumber: registration.registryNumber });
  if (!applied) return;

  const prisma = db();
  const incorporatedAt = new Date(registration.incorporatedAt);
  const company = await prisma.company.update({
    where: { id: filing.companyId },
    data: {
      legalName: registration.legalName ?? undefined,
      registryNumber: registration.registryNumber,
      incorporatedAt,
    },
    include: { shareholders: { orderBy: { createdAt: "asc" } } },
  });
  await Promise.all([
    ...company.shareholders.map((s, i) =>
      prisma.shareholder.update({ where: { id: s.id }, data: { certificateNumber: i + 1, issuedAt: incorporatedAt } }),
    ),
    prisma.officer.updateMany({ where: { companyId: company.id, appointedAt: null }, data: { appointedAt: incorporatedAt } }),
  ]);
}

/**
 * Post-approval fulfilment: generate the legal document pack, fetch the
 * registry's official documents and build the compliance calendar. Safe to
 * re-run; each part is skipped if already done.
 */
export async function fulfilApprovedFiling(filingId: string): Promise<{ documents: number; complianceEvents: number }> {
  const prisma = db();
  const filing = await prisma.filing.findUniqueOrThrow({
    where: { id: filingId },
    include: {
      company: { include: { officers: true, shareholders: true, beneficialOwners: true } },
      documents: { select: { source: true, type: true } },
    },
  });
  if (filing.status !== "APPROVED") return { documents: 0, complianceEvents: 0 };
  const { company } = filing;
  let documents = 0;

  if (!filing.documents.some((d) => d.source === "GENERATED")) {
    // Officers' e-signed consents replace the unsigned consent form in the pack.
    const signedConsents = filing.documents.some((d) => d.source === "SIGNED" && d.type === "CONSENT_TO_ACT");
    const { packReviewOptions } = await import("../legal/templates");
    const pack = await generateDocumentPack(documentContextFromCompany(company), {
      exclude: signedConsents ? ["CONSENT_TO_ACT"] : [],
      ...(await packReviewOptions()),
    });
    for (const doc of pack) {
      const stored = await storage().put(documentKey(company.id, doc.fileName), doc.content);
      await prisma.document.create({
        data: {
          companyId: company.id,
          filingId,
          type: doc.type,
          title: doc.title,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          storageKey: stored.key,
          sizeBytes: stored.sizeBytes,
          checksum: stored.checksum,
          source: "GENERATED",
          templateId: doc.template?.id,
          templateVersion: doc.template?.version,
          templateFingerprint: doc.template?.fingerprint,
          templateReviewed: doc.template?.reviewed,
        },
      });
      documents++;
    }
  }

  if (!filing.documents.some((d) => d.source === "REGISTRY") && filing.registryReference) {
    try {
      const official = await getRegistryAdapterForReference(filing.registryReference).downloadOfficialDocuments(filing.registryReference);
      for (const doc of official) {
        const stored = await storage().put(documentKey(company.id, doc.fileName), doc.content);
        await prisma.document.create({
          data: {
            companyId: company.id,
            filingId,
            type: doc.type,
            title: doc.title,
            fileName: doc.fileName,
            mimeType: doc.mimeType,
            storageKey: stored.key,
            sizeBytes: stored.sizeBytes,
            checksum: stored.checksum,
            source: "REGISTRY",
          },
        });
        documents++;
      }
    } catch (error) {
      // The mock registry forgets lodgements on restart; real registries can be re-fetched later.
      if (!(isRegistryError(error) && error.code === "NOT_FOUND")) throw error;
      console.warn(`[lodgement] official documents unavailable for ${filing.registryReference}: ${error.message}`);
    }
  }

  let complianceEvents = 0;
  const hasCalendar = await prisma.complianceEvent.count({ where: { companyId: company.id } });
  if (!hasCalendar && company.incorporatedAt) {
    const schedule = buildComplianceSchedule(company.jurisdiction, company.entityType, company.incorporatedAt);
    const { count } = await prisma.complianceEvent.createMany({
      data: schedule.map((e) => ({
        companyId: company.id,
        type: e.type,
        title: e.title,
        description: e.description,
        dueDate: e.dueDate,
        feeEstimate: e.feeEstimate ?? null,
      })),
    });
    complianceEvents = count;
  }

  if (documents > 0) await notifyCustomer(filingId, "APPROVED", `${company.legalName ?? company.proposedName} is registered and your documents are ready.`);

  // Tax ID add-on: start the EIN / ABN / UTR registration now that we have a registry number.
  const { startTaxRegistration } = await import("../tax/service");
  const taxFilingId = await startTaxRegistration(company.id);
  if (taxFilingId) {
    const { dispatchTaxRegistration } = await import("../jobs/dispatch");
    await dispatchTaxRegistration(taxFilingId);
  }
  return { documents, complianceEvents };
}

/** Email the company owner about a milestone. Failures are logged, never thrown. */
export async function notifyCustomer(filingId: string, status: "APPROVED" | "REQUIRES_ACTION" | "REJECTED", detail: string) {
  try {
    const filing = await db().filing.findUniqueOrThrow({ where: { id: filingId }, include: { company: { include: { owner: true } } } });
    const name = filing.company.legalName ?? filing.company.proposedName;
    const content = {
      APPROVED: { subject: `${name} is registered 🎉`, heading: "Your company is registered", paragraphs: [detail, "Your certificate, governing documents and registers are in your document vault."] },
      REQUIRES_ACTION: { subject: `Action needed: ${name}`, heading: "We need a little more information", paragraphs: [detail, "Our team will contact you, or you can reply to this email."] },
      REJECTED: { subject: `Update on ${name}`, heading: "The registry didn't accept the application", paragraphs: [detail, "We'll be in touch about next steps, including a refund of unused government fees."] },
    }[status];
    await sendEmail({
      to: filing.company.owner.email,
      category: "receipt",
      ...layout({ ...content, action: { label: "Open dashboard", url: `${appUrl()}/dashboard` } }),
    });
  } catch (error) {
    console.error(`[lodgement] couldn't notify customer about ${filingId}`, error);
  }
}
