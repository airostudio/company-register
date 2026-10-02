import { createHash } from "node:crypto";
import type { DocumentType, EntityType, Jurisdiction } from "@/lib/domain";
import { getJurisdiction } from "@/lib/jurisdictions";
import { sampleDocumentContext } from "../sample";
import type { DocumentContext } from "../types";
import { partsFor, renderGoverningDocument, type GoverningType } from "./governing";
import { consentStatements, renderConsentsToAct, renderShareCertificate, shareCertificateWording } from "./registers";

/**
 * Legally significant templates. Each has a fingerprint of its canonical
 * wording; a lawyer's sign-off (TemplateReview) applies to one fingerprint, so
 * any wording change needs a fresh review. Bump `version` when changing wording.
 */
export interface TemplateDefinition {
  id: string;
  title: string;
  documentType: DocumentType;
  jurisdiction: Jurisdiction;
  entityTypes: EntityType[];
  version: string;
  /** Statutes and sources the reviewer should check the wording against. */
  sources: string[];
  /** What the reviewing lawyer must confirm. */
  checklist: string[];
  canonicalText(): string;
  renderPreview(): Promise<Uint8Array>;
}

const COMMON_CHECKS = [
  "Statutory references are correct and current.",
  "Wording is suitable for the platform's typical customer (small private company, founders, no external investors).",
  "Anything that should be customer-specific (share classes, transfer restrictions, quorum) is flagged for bespoke advice.",
];

function governing(
  id: string,
  type: GoverningType,
  jurisdiction: Jurisdiction,
  entityType: EntityType,
  version: string,
  sources: string[],
  checklist: string[],
): TemplateDefinition {
  const ctx = () => sampleDocumentContext(jurisdiction, entityType);
  return {
    id,
    title: `${{ CONSTITUTION: "Constitution", BYLAWS: "Bylaws", OPERATING_AGREEMENT: "Operating agreement", ARTICLES_OF_ASSOCIATION: "Articles of association" }[type]} — ${getJurisdiction(jurisdiction).shortName}`,
    documentType: type,
    jurisdiction,
    entityTypes: [entityType],
    version,
    sources,
    checklist: [...checklist, ...COMMON_CHECKS],
    canonicalText: () =>
      partsFor(type, ctx())
        .map((p) => `${p.title}\n${p.clauses.join("\n")}`)
        .join("\n\n"),
    renderPreview: () => renderGoverningDocument(type, ctx()),
  };
}

function consent(jurisdiction: Jurisdiction, entityTypes: EntityType[], version: string, sources: string[]): TemplateDefinition {
  const ctx = () => sampleDocumentContext(jurisdiction, entityTypes[0]!);
  return {
    id: `CONSENT_${jurisdiction}`,
    title: `Consent to act — ${getJurisdiction(jurisdiction).shortName}`,
    documentType: "CONSENT_TO_ACT",
    jurisdiction,
    entityTypes,
    version,
    sources,
    checklist: [
      "The consent satisfies the statutory requirement for consent before appointment.",
      "A typed-name electronic signature with the recorded audit trail is acceptable evidence of consent.",
      ...COMMON_CHECKS,
    ],
    canonicalText: () => consentStatements(ctx().officers[0]!, ctx()).join("\n"),
    renderPreview: () => renderConsentsToAct(ctx()),
  };
}

function certificate(jurisdiction: Jurisdiction, entityType: EntityType, version: string, sources: string[]): TemplateDefinition {
  const ctx = () => sampleDocumentContext(jurisdiction, entityType);
  return {
    id: `SHARE_CERTIFICATE_${jurisdiction}`,
    title: `Share certificate — ${getJurisdiction(jurisdiction).shortName}`,
    documentType: "SHARE_CERTIFICATE",
    jurisdiction,
    entityTypes: [entityType],
    version,
    sources,
    checklist: ["Certificate contents meet the statutory minimum (company, number, class, amount paid).", "Execution (signatories) is valid for the company type.", ...COMMON_CHECKS],
    canonicalText: () => shareCertificateWording(ctx().shareholders[0]!, ctx()),
    renderPreview: () => renderShareCertificate(ctx(), 0),
  };
}

export const TEMPLATES: TemplateDefinition[] = [
  governing("AU_CONSTITUTION", "CONSTITUTION", "AU", "AU_PTY_LTD", "2026.10.1", ["Corporations Act 2001 (Cth) ss 113, 134–141, 191, 195, 201A, 248A–249T, 254A–254T, 1071H"], [
    "Replaceable rules are displaced appropriately (s135, s141 table).",
    "Pre-emptive rights on issue and transfer are drafted to suit proprietary companies.",
    "Director interest and voting clause is appropriate for a proprietary company (s195 only binds public companies).",
    "Dividend clause reflects s254T.",
  ]),
  governing("US_DE_BYLAWS", "BYLAWS", "US_DE", "US_C_CORP", "2026.10.1", ["Delaware General Corporation Law §§ 102, 109, 141, 142, 145, 158, 211, 216, 228"], [
    "Officer, quorum and consent provisions are consistent with the DGCL and the certificate of incorporation.",
    "Indemnification is appropriate and consistent with § 145.",
  ]),
  governing("US_WY_BYLAWS", "BYLAWS", "US_WY", "US_C_CORP", "2026.10.1", ["Wyoming Business Corporation Act (W.S. 17-16-101 et seq.)"], [
    "Officer, quorum and consent provisions are consistent with the Wyoming Business Corporation Act.",
  ]),
  governing("US_DE_OPERATING_AGREEMENT", "OPERATING_AGREEMENT", "US_DE", "US_LLC", "2026.10.1", ["Delaware Limited Liability Company Act (6 Del. C. § 18-101 et seq.)"], [
    "Manager-managed structure, member consent matters and transfer restrictions are sound.",
    "Tax classification language and allocations are appropriate for single- and multi-member LLCs.",
    "Dissolution and distribution order is consistent with § 18-804.",
  ]),
  governing("US_WY_OPERATING_AGREEMENT", "OPERATING_AGREEMENT", "US_WY", "US_LLC", "2026.10.1", ["Wyoming Limited Liability Company Act (W.S. 17-29-101 et seq.)"], [
    "Manager-managed structure, member consent matters and transfer restrictions are sound under Wyoming law.",
    "Tax classification language and allocations are appropriate.",
  ]),
  governing("UK_ARTICLES", "ARTICLES_OF_ASSOCIATION", "UK", "UK_LTD", "2026.10.1", ["Companies Act 2006 ss 18–21, 318, 550, 551, 561, 830; Companies (Model Articles) Regulations 2008 Sch 1"], [
    "Model articles are incorporated correctly and the amendments are effective.",
    "Allotment authority (s550/s551) and pre-emption (s561) wording is accurate.",
    "Transfer pre-emption provisions are workable.",
    "Companies House will accept these as bespoke articles (they are not 'model articles only').",
  ]),
  consent("AU", ["AU_PTY_LTD"], "2026.10.1", ["Corporations Act 2001 (Cth) s 201D; Electronic Transactions Act 1999 (Cth)"]),
  consent("UK", ["UK_LTD"], "2026.10.1", ["Companies Act 2006 s 12; Electronic Communications Act 2000"]),
  consent("US_DE", ["US_C_CORP", "US_LLC"], "2026.10.1", ["DGCL § 141; 6 Del. C. § 18-401; Delaware Uniform Electronic Transactions Act"]),
  consent("US_WY", ["US_C_CORP", "US_LLC"], "2026.10.1", ["Wyoming Business Corporation Act; Wyoming LLC Act; Wyoming UETA (W.S. 40-21-101 et seq.)"]),
  certificate("AU", "AU_PTY_LTD", "2026.10.1", ["Corporations Act 2001 (Cth) ss 1070C, 1071H"]),
  certificate("UK", "UK_LTD", "2026.10.1", ["Companies Act 2006 ss 768–769"]),
  certificate("US_DE", "US_C_CORP", "2026.10.1", ["DGCL § 158"]),
  certificate("US_WY", "US_C_CORP", "2026.10.1", ["W.S. 17-16-625"]),
];

export function templateFingerprint(template: TemplateDefinition): string {
  return createHash("sha256").update(template.canonicalText()).digest("hex").slice(0, 16);
}

export function templateFor(documentType: DocumentType, jurisdiction: Jurisdiction, entityType: EntityType): TemplateDefinition | undefined {
  return TEMPLATES.find((t) => t.documentType === documentType && t.jurisdiction === jurisdiction && t.entityTypes.includes(entityType));
}

export interface TemplateStamp {
  id: string;
  version: string;
  fingerprint: string;
}

export function templateStamp(documentType: DocumentType, ctx: DocumentContext): TemplateStamp | undefined {
  const template = templateFor(documentType, ctx.company.jurisdiction, ctx.company.entityType);
  return template && { id: template.id, version: template.version, fingerprint: templateFingerprint(template) };
}

export const PENDING_REVIEW_WATERMARK = "DRAFT · PENDING LEGAL REVIEW";
