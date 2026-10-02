import { createHash } from "node:crypto";
import type { SignatureRequest, User } from "@prisma/client";
import { renderConsentsToAct, reviewState, rolePhrase } from "@/lib/documents";
import type { OfficerRole } from "@/lib/domain";
import { db } from "../db";
import { documentContextFromCompany } from "../documents";
import { sendEmail } from "../email";
import { layout } from "../email/templates";
import { AppError } from "../errors";
import { notifyCustomer, transition } from "../formations/lodgement";
import { dispatchFilingLodgement } from "../jobs/dispatch";
import { packReviewOptions } from "../legal/templates";
import { hashToken, newToken } from "../session";
import { documentKey, storage } from "../storage";
import { appUrl } from "../urls";

const LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Typed signatures must match the signer's legal name, ignoring case, spacing and punctuation. */
export function signatureMatches(typed: string, legalName: string): boolean {
  const norm = (v: string) => v.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
  return norm(typed).length > 0 && norm(typed) === norm(legalName);
}

async function loadCompany(companyId: string) {
  return db().company.findUniqueOrThrow({
    where: { id: companyId },
    include: { officers: { orderBy: { createdAt: "asc" } }, shareholders: true, beneficialOwners: true, owner: true },
  });
}

/**
 * Create one consent-to-act signature request per officer and email each
 * signer a private link. Idempotent per filing.
 */
export async function requestSignatures(filingId: string): Promise<SignatureRequest[]> {
  const prisma = db();
  const filing = await prisma.filing.findUniqueOrThrow({ where: { id: filingId }, include: { signatures: true } });
  if (filing.signatures.length) return filing.signatures;

  const company = await loadCompany(filing.companyId);
  const ctx = documentContextFromCompany(company);
  const review = reviewState("CONSENT_TO_ACT", ctx, await packReviewOptions());
  const officers = company.officers.filter((o) => !o.ceasedAt);
  const created: SignatureRequest[] = [];
  for (const [index, officer] of officers.entries()) {
    if (!officer.email) throw new AppError(422, "SIGNER_EMAIL_MISSING", `${officer.fullName} has no email address to sign with`);
    const pdf = await renderConsentsToAct(ctx, { officerIndex: index, watermark: review.watermark });
    const stored = await storage().put(documentKey(company.id, `consent-to-act-${officer.id}.pdf`), pdf);
    const token = newToken();
    const request = await prisma.signatureRequest.create({
      data: {
        filingId,
        companyId: company.id,
        officerId: officer.id,
        signerName: officer.fullName,
        signerEmail: officer.email.toLowerCase(),
        roles: officer.roles,
        tokenHash: hashToken(token),
        documentKey: stored.key,
        documentHash: sha256(pdf),
        expiresAt: new Date(Date.now() + LINK_TTL_MS),
      },
    });
    await emailSigner(request, company.proposedName, company.owner.name ?? company.owner.email, token);
    created.push(request);
  }
  return created;
}

async function emailSigner(request: SignatureRequest, companyName: string, requestedBy: string, token: string) {
  const roles = rolePhrase(request.roles as OfficerRole[]);
  await sendEmail({
    to: request.signerEmail,
    category: "signature",
    ...layout({
      subject: `Please sign: consent to act as ${roles} of ${companyName}`,
      heading: `Consent to act for ${companyName}`,
      paragraphs: [
        `${requestedBy} is registering ${companyName} and has named you as ${roles}.`,
        "Before we can lodge the registration, the law requires your written consent. Review the consent and sign it electronically — it takes a minute.",
        "This link is personal to you and expires in 30 days. If you don't agree to act, you can decline on the same page.",
      ],
      action: { label: "Review and sign", url: `${appUrl()}/sign/${token}` },
    }),
  });
}

export async function findRequestByToken(token: string) {
  return db().signatureRequest.findUnique({ where: { tokenHash: hashToken(token) } });
}

/** A signed-in user may sign requests addressed to their own (verified) email. */
export async function findRequestForUser(id: string, user: User) {
  if (!user.emailVerifiedAt) return null; // an unverified session doesn't prove the user owns that inbox
  const request = await db().signatureRequest.findUnique({ where: { id } });
  if (!request || request.signerEmail !== user.email.toLowerCase()) return null;
  return request;
}

export interface SignInput {
  typedName: string;
  agree: boolean;
  ip?: string | null;
  userAgent?: string | null;
}

export async function signConsent(request: SignatureRequest, input: SignInput): Promise<void> {
  assertOpen(request);
  if (!input.agree) throw new AppError(400, "CONSENT_REQUIRED", "Tick the box to confirm you agree to sign electronically");
  if (!signatureMatches(input.typedName, request.signerName)) {
    throw new AppError(400, "NAME_MISMATCH", `Type your full legal name exactly as shown: ${request.signerName}`);
  }
  const prisma = db();
  const signedAt = new Date();
  const { count } = await prisma.signatureRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: { status: "SIGNED", signedName: input.typedName.trim(), signedAt, signedIp: input.ip ?? null, signedUserAgent: input.userAgent?.slice(0, 300) ?? null },
  });
  if (count === 0) throw new AppError(409, "ALREADY_COMPLETED", "This consent has already been completed");

  // Re-render the consent with the signature and audit trail, and file it in the vault.
  const company = await loadCompany(request.companyId);
  const ctx = documentContextFromCompany(company);
  const index = company.officers.filter((o) => !o.ceasedAt).findIndex((o) => o.id === request.officerId);
  const review = reviewState("CONSENT_TO_ACT", ctx, await packReviewOptions());
  const pdf = await renderConsentsToAct(ctx, {
    officerIndex: Math.max(index, 0),
    watermark: review.watermark,
    signature: {
      signedName: input.typedName.trim(),
      signedAt: signedAt.toISOString(),
      email: request.signerEmail,
      ip: input.ip,
      userAgent: input.userAgent,
      documentHash: request.documentHash,
      requestId: request.id,
    },
  });
  const fileName = `consent-to-act-${request.signerName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-signed.pdf`;
  const stored = await storage().put(documentKey(company.id, fileName), pdf);
  const doc = await prisma.document.create({
    data: {
      companyId: company.id,
      filingId: request.filingId,
      type: "CONSENT_TO_ACT",
      title: `Consent to Act — ${request.signerName} (signed)`,
      fileName,
      storageKey: stored.key,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      source: "SIGNED",
      templateId: review.template?.id,
      templateVersion: review.template?.version,
      templateFingerprint: review.template?.fingerprint,
      templateReviewed: review.template?.reviewed,
    },
  });
  await prisma.signatureRequest.update({ where: { id: request.id }, data: { signedDocumentId: doc.id } });
  await prisma.officer.update({ where: { id: request.officerId }, data: { consentSignedAt: signedAt } });
  await prisma.filingEvent.create({
    data: { filingId: request.filingId, status: "AWAITING_SIGNATURES", message: `${request.signerName} signed their consent to act.` },
  });
  await advanceIfAllSigned(request.filingId);
}

export async function declineConsent(request: SignatureRequest, reason: string): Promise<void> {
  assertOpen(request);
  const prisma = db();
  const { count } = await prisma.signatureRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: { status: "DECLINED", declinedReason: reason.trim().slice(0, 1000) || null },
  });
  if (count === 0) throw new AppError(409, "ALREADY_COMPLETED", "This consent has already been completed");
  const filing = await prisma.filing.findUniqueOrThrow({ where: { id: request.filingId } });
  const message = `${request.signerName} declined to act${reason.trim() ? `: "${reason.trim()}"` : ""}. Contact us to change the company's officers.`;
  if (filing.status === "AWAITING_SIGNATURES") {
    await transition(filing, "AWAITING_SIGNATURES", "REQUIRES_ACTION", message, { errorCode: "CONSENT_DECLINED", errorMessage: message });
    await notifyCustomer(filing.id, "REQUIRES_ACTION", message);
  }
}

/** Once every officer has signed, release the filing for lodgement. */
export async function advanceIfAllSigned(filingId: string): Promise<boolean> {
  const prisma = db();
  const requests = await prisma.signatureRequest.findMany({ where: { filingId } });
  if (!requests.length || requests.some((r) => r.status !== "SIGNED")) return false;
  const filing = await prisma.filing.findUniqueOrThrow({ where: { id: filingId } });
  if (filing.status !== "AWAITING_SIGNATURES") return false;
  const moved = await transition(filing, "AWAITING_SIGNATURES", "QUEUED", "All consents signed — queued for lodgement.");
  if (moved) await dispatchFilingLodgement(filingId);
  return moved;
}

/** Issue a fresh link (the old one stops working) and email it again. */
export async function resendSignature(request: SignatureRequest): Promise<void> {
  if (request.status !== "PENDING" && request.status !== "EXPIRED") throw new AppError(409, "ALREADY_COMPLETED", "This consent has already been completed");
  const token = newToken();
  const updated = await db().signatureRequest.update({
    where: { id: request.id },
    data: { tokenHash: hashToken(token), status: "PENDING", sentAt: new Date(), expiresAt: new Date(Date.now() + LINK_TTL_MS) },
  });
  const company = await loadCompany(request.companyId);
  await emailSigner(updated, company.proposedName, company.owner.name ?? company.owner.email, token);
}

function assertOpen(request: SignatureRequest) {
  if (request.status !== "PENDING") throw new AppError(409, "ALREADY_COMPLETED", "This consent has already been completed");
  if (request.expiresAt < new Date()) throw new AppError(410, "EXPIRED", "This signing link has expired — ask for a new one");
}
