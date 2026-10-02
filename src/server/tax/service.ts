import { renderTaxConfirmation } from "@/lib/documents";
import type { OfficerRole } from "@/lib/domain";
import { getJurisdiction } from "@/lib/jurisdictions";
import { PLANS, type AddOnId } from "@/lib/pricing/catalog";
import { buildTaxApplication, type TaxApplication } from "@/lib/tax/application";
import type { Address } from "@/lib/validation/address";
import type { FormationApplication } from "@/lib/validation/formation";
import { db, toJson } from "../db";
import { sendEmail } from "../email";
import { layout } from "../email/templates";
import { transition } from "../formations/lodgement";
import { documentKey, storage } from "../storage";
import { appUrl } from "../urls";
import { taxAdapterFor, taxAdapterForReference } from "./adapters";

/** Whether the customer bought tax registration (directly or via a plan that includes it). */
export function purchasedTaxRegistration(company: { jurisdictionData: unknown; formationPayload: unknown }): boolean {
  const addOns = ((company.jurisdictionData as { addOns?: AddOnId[] } | null)?.addOns ?? []) as AddOnId[];
  const plan = (company.formationPayload as FormationApplication | null)?.addons.plan;
  return addOns.includes("TAX_ID") || (!!plan && PLANS[plan].includes.includes("TAX_ID"));
}

/**
 * Start the tax registration for an incorporated company. Idempotent: creates
 * the TAX_ID_APPLICATION filing once, and (re)submits it while it's still QUEUED.
 */
export async function startTaxRegistration(companyId: string): Promise<string | undefined> {
  const prisma = db();
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    include: { officers: true, shareholders: true, filings: { where: { type: "TAX_ID_APPLICATION" } } },
  });
  if (!company.registryNumber || !company.incorporatedAt || !purchasedTaxRegistration(company)) return undefined;

  let filing = company.filings[0];
  if (!filing) {
    const application = buildTaxApplication({
      jurisdiction: company.jurisdiction,
      entityType: company.entityType,
      companyName: company.legalName ?? company.proposedName,
      registryNumber: company.registryNumber,
      incorporatedAt: company.incorporatedAt,
      address: ((company.principalAddress ?? company.registeredAddress) as unknown) as Address,
      businessActivity: company.businessActivity ?? "",
      sicCodes: company.sicCodes,
      officers: company.officers.map((o) => ({
        fullName: o.fullName,
        roles: o.roles as OfficerRole[],
        residentialAddress: o.residentialAddress as unknown as Address,
        nationality: o.nationality,
      })),
      memberCount: company.shareholders.length,
    });
    filing = await prisma.filing.create({
      data: {
        companyId,
        type: "TAX_ID_APPLICATION",
        status: "QUEUED",
        jurisdiction: company.jurisdiction,
        requestPayload: toJson(application),
        events: { create: { status: "QUEUED", message: `${application.form} prepared.` } },
      },
    });
  }
  if (filing.status === "QUEUED" && !filing.registryReference) {
    const application = filing.requestPayload as unknown as TaxApplication;
    const { reference } = await taxAdapterFor(company.jurisdiction).submit(application, { companyId, filingId: filing.id });
    await transition(filing, "QUEUED", "SUBMITTED", `Tax registration lodged (reference ${reference}).`, { registryReference: reference, submittedAt: new Date() });
  }
  return filing.id;
}

export interface TaxSyncResult {
  status: string;
  settled: boolean;
  nextPollInMs?: number;
}

/** Poll the tax authority (or ops task) once and record the outcome. */
export async function syncTaxRegistration(filingId: string): Promise<TaxSyncResult> {
  const prisma = db();
  const filing = await prisma.filing.findUniqueOrThrow({ where: { id: filingId }, include: { company: { include: { owner: true } } } });
  const settledStatuses = ["APPROVED", "REJECTED", "FAILED"];
  if (filing.type !== "TAX_ID_APPLICATION" || !filing.registryReference || settledStatuses.includes(filing.status)) {
    return { status: filing.status, settled: settledStatuses.includes(filing.status) };
  }
  const application = filing.requestPayload as unknown as TaxApplication;
  const adapter = taxAdapterForReference(filing.registryReference);
  const result = await adapter.poll(filing.registryReference, application);
  await prisma.filing.update({ where: { id: filing.id }, data: { lastPolledAt: new Date(), pollAttempts: { increment: 1 } } });

  switch (result.status) {
    case "PENDING": {
      const target = result.stage === "SUBMITTED" ? "UNDER_REVIEW" : "SUBMITTED";
      if (filing.status !== target) await transition(filing, filing.status, target, result.message);
      return { status: target, settled: false, nextPollInMs: result.nextPollInMs };
    }
    case "ACTION_REQUIRED":
    case "REJECTED": {
      const target = result.status === "REJECTED" ? "REJECTED" : "REQUIRES_ACTION";
      if (filing.status !== target) await transition(filing, filing.status, target, result.message, { errorCode: "TAX_" + result.status, errorMessage: result.message });
      // REQUIRES_ACTION keeps polling: staff resume the task once the customer replies.
      return { status: target, settled: target === "REJECTED", nextPollInMs: 60 * 60_000 };
    }
    case "ISSUED": {
      const moved = await transition(filing, filing.status, "APPROVED", `${getJurisdiction(filing.jurisdiction).identifiers.taxId} issued: ${result.taxId}`, { decidedAt: new Date(result.issuedAt) });
      if (moved) await recordTaxId(filing.id, filing.companyId, application, result, adapter.mode === "mock");
      return { status: "APPROVED", settled: true };
    }
  }
}

async function recordTaxId(
  filingId: string,
  companyId: string,
  application: TaxApplication,
  result: { taxId: string; issuedAt: string; document?: { title: string; content: Uint8Array } },
  simulated: boolean,
) {
  const prisma = db();
  const company = await prisma.company.update({ where: { id: companyId }, data: { taxId: result.taxId }, include: { owner: true } });
  const content = result.document?.content ?? (await renderTaxConfirmation({ app: application, taxId: result.taxId, issuedAt: result.issuedAt, simulated }));
  const label = getJurisdiction(company.jurisdiction).identifiers.taxId;
  const fileName = `${label.toLowerCase()}-confirmation.pdf`;
  const stored = await storage().put(documentKey(companyId, fileName), content);
  await prisma.document.create({
    data: {
      companyId,
      filingId,
      type: "TAX_ID_CONFIRMATION",
      title: result.document?.title ?? `${label} confirmation`,
      fileName,
      storageKey: stored.key,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      source: result.document ? "REGISTRY" : "GENERATED",
    },
  });
  await sendEmail({
    to: company.owner.email,
    category: "receipt",
    ...layout({
      subject: `Your ${label} is ready: ${result.taxId}`,
      heading: `${company.legalName ?? company.proposedName} has its ${label}`,
      paragraphs: [`Your ${label} is ${result.taxId}. The confirmation is in your document vault.`],
      action: { label: "Open dashboard", url: `${appUrl()}/dashboard` },
    }),
  }).catch((error) => console.error("[tax] couldn't email confirmation", error));
}

/** Inline job runner: move tax registrations forward when the owner views their dashboard. */
export async function advanceTaxFilingsInline(ownerId: string): Promise<void> {
  const filings = await db().filing.findMany({
    where: { type: "TAX_ID_APPLICATION", status: { in: ["QUEUED", "SUBMITTED", "UNDER_REVIEW", "REQUIRES_ACTION"] }, company: { ownerId } },
  });
  for (const f of filings) {
    try {
      if (f.status === "QUEUED") await startTaxRegistration(f.companyId);
      else await syncTaxRegistration(f.id);
    } catch (error) {
      console.error(`[tax] inline advance failed for ${f.id}`, error);
    }
  }
}
