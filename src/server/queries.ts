import type { FilingView } from "@/lib/api-types";
import { complianceStatus } from "@/lib/compliance/calendar";
import { filingStatusToLifecycle } from "@/lib/domain";
import { db } from "./db";
import { isSettled } from "./formations/lodgement";

export async function getFilingView(filingId: string, ownerId: string): Promise<FilingView | null> {
  const filing = await db().filing.findFirst({
    where: { id: filingId, company: { ownerId } },
    include: {
      company: { include: { owner: true } },
      order: true,
      signatures: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      documents: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, title: true, source: true, templateReviewed: true } },
    },
  });
  if (!filing) return null;
  return {
    id: filing.id,
    status: filing.status,
    lifecycle: filingStatusToLifecycle(filing.status),
    registryReference: filing.registryReference,
    expedited: filing.expedited,
    submittedAt: filing.submittedAt?.toISOString() ?? null,
    decidedAt: filing.decidedAt?.toISOString() ?? null,
    error: filing.errorCode ? { code: filing.errorCode, message: filing.errorMessage ?? "", field: filing.errorField } : null,
    company: {
      id: filing.company.id,
      name: filing.company.legalName ?? filing.company.proposedName,
      registryNumber: filing.company.registryNumber,
      jurisdiction: filing.company.jurisdiction,
      entityType: filing.company.entityType,
      status: filing.company.status,
    },
    events: filing.events.map((e) => ({ id: e.id, status: e.status, message: e.message, createdAt: e.createdAt.toISOString() })),
    documents: filing.documents,
    payment: filing.order ? { status: filing.order.status, amount: filing.order.grandTotal, currency: filing.order.currency } : null,
    packReady: filing.documents.some((d) => d.source === "GENERATED"),
    signatures: filing.signatures.map((s) => ({
      id: s.id,
      signerName: s.signerName,
      signerEmail: s.signerEmail,
      roles: s.roles,
      status: s.status === "PENDING" && s.expiresAt < new Date() ? "EXPIRED" : s.status,
      signedAt: s.signedAt?.toISOString() ?? null,
      canSignHere: s.status === "PENDING" && !!filing.company.owner.emailVerifiedAt && filing.company.owner.email.toLowerCase() === s.signerEmail,
    })),
    settled: isSettled(filing.status),
  };
}

export async function getDashboard(ownerId: string) {
  const now = new Date();
  const companies = await db().company.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    include: {
      filings: { orderBy: { createdAt: "desc" }, include: { events: { orderBy: { createdAt: "asc" } } } },
      documents: { orderBy: [{ source: "desc" }, { createdAt: "asc" }] },
      complianceEvents: { orderBy: { dueDate: "asc" } },
      subscription: true,
      officers: { select: { fullName: true, roles: true } },
    },
  });
  return companies.map((c) => ({
    ...c,
    complianceEvents: c.complianceEvents.map((e) => ({ ...e, status: complianceStatus(e.dueDate, now, e.completedAt) })),
  }));
}

export type DashboardCompany = Awaited<ReturnType<typeof getDashboard>>[number];
