import { TEMPLATES, templateFingerprint, type TemplateDefinition } from "@/lib/documents";
import { db } from "../db";

/** TEMPLATE_REVIEW_MODE=off suppresses the draft watermark (e.g. local development). */
export function templateReviewMode(): "watermark" | "off" {
  return process.env.TEMPLATE_REVIEW_MODE === "off" ? "off" : "watermark";
}

/** `id@fingerprint` keys whose latest review for that exact wording is an approval. */
export async function reviewedTemplateKeys(): Promise<Set<string>> {
  const reviews = await db().templateReview.findMany({ orderBy: { reviewedAt: "desc" } });
  const latest = new Map<string, (typeof reviews)[number]>();
  for (const r of reviews) {
    const key = `${r.templateId}@${r.fingerprint}`;
    if (!latest.has(key)) latest.set(key, r);
  }
  return new Set([...latest.entries()].filter(([, r]) => r.status === "APPROVED").map(([k]) => k));
}

export async function packReviewOptions() {
  return { reviewed: await reviewedTemplateKeys(), reviewMode: templateReviewMode() };
}

export interface TemplateStatus {
  template: TemplateDefinition;
  fingerprint: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "CHANGED_SINCE_REVIEW" | "NOT_REVIEWED";
  latestReview?: Awaited<ReturnType<typeof listReviews>>[number];
}

async function listReviews() {
  return db().templateReview.findMany({ orderBy: { reviewedAt: "desc" } });
}

export async function templateStatuses(): Promise<TemplateStatus[]> {
  const reviews = await listReviews();
  return TEMPLATES.map((template) => {
    const fingerprint = templateFingerprint(template);
    const forTemplate = reviews.filter((r) => r.templateId === template.id);
    const current = forTemplate.find((r) => r.fingerprint === fingerprint);
    const state: TemplateStatus["state"] = current
      ? current.status
      : forTemplate.length
        ? "CHANGED_SINCE_REVIEW"
        : "NOT_REVIEWED";
    return { template, fingerprint, state, latestReview: current ?? forTemplate[0] };
  });
}
