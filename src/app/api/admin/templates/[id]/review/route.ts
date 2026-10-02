import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { TEMPLATES, templateFingerprint } from "@/lib/documents";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/session";
import { appUrl } from "@/server/urls";

const schema = z.object({
  fingerprint: z.string().length(16),
  status: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  reviewerName: z.string().trim().min(3, "Enter the reviewing lawyer's name"),
  reviewerFirm: z.string().trim().min(2, "Enter the firm"),
  reviewerAdmission: z.string().trim().min(5, "Enter the lawyer's admission (jurisdiction and practising certificate / bar number)"),
  adviceReference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  reviewedAt: z.iso.date("Enter the date of the advice"),
  confirm: z.literal("on", { error: "Confirm you hold the lawyer's written advice" }),
});

/** POST /api/admin/templates/:id/review — record a lawyer's sign-off on the template's current wording. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Ops access required" } }, { status: 403 });
  const back = `${appUrl(request)}/admin/templates`;
  const template = TEMPLATES.find((t) => t.id === id);
  if (!template) return NextResponse.redirect(`${back}?error=${encodeURIComponent("Unknown template")}`, 303);

  const parsed = schema.safeParse(Object.fromEntries((await request.formData()).entries()));
  if (!parsed.success) return NextResponse.redirect(`${back}?error=${encodeURIComponent(parsed.error.issues[0]!.message)}#${id}`, 303);
  // The review must be for the wording the reviewer actually saw.
  if (parsed.data.fingerprint !== templateFingerprint(template)) {
    return NextResponse.redirect(`${back}?error=${encodeURIComponent("The template wording changed since this page loaded — review the new preview")}#${id}`, 303);
  }
  const { fingerprint, status, reviewerName, reviewerFirm, reviewerAdmission, adviceReference, notes, reviewedAt } = parsed.data;
  await db().templateReview.create({
    data: { fingerprint, status, reviewerName, reviewerFirm, reviewerAdmission, adviceReference, notes, templateId: template.id, templateVersion: template.version, reviewedAt: new Date(`${reviewedAt}T00:00:00Z`), recordedById: admin.id },
  });
  return NextResponse.redirect(`${back}?ok=${encodeURIComponent(template.id)}#${id}`, 303);
}
