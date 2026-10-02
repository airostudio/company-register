import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { templateReviewMode, templateStatuses, type TemplateStatus } from "@/server/legal/templates";
import { requireAdmin } from "@/server/session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const metadata: Metadata = { title: "Legal templates" };
export const dynamic = "force-dynamic";

const STATE: Record<TemplateStatus["state"], { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  APPROVED: { label: "Approved", variant: "success" },
  CHANGES_REQUESTED: { label: "Changes requested", variant: "destructive" },
  CHANGED_SINCE_REVIEW: { label: "Wording changed since review", variant: "warning" },
  NOT_REVIEWED: { label: "Not reviewed", variant: "secondary" },
};

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await requireAdmin())) notFound();
  const { ok, error } = await searchParams;
  const statuses = await templateStatuses();
  const approved = statuses.filter((s) => s.state === "APPROVED").length;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin">
          <ArrowLeft /> Ops console
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold">Legal templates</h1>
        <p className="text-sm text-muted-foreground">
          {approved} of {statuses.length} approved. Documents from unapproved templates are{" "}
          {templateReviewMode() === "watermark" ? "watermarked “DRAFT · PENDING LEGAL REVIEW”" : "NOT watermarked (TEMPLATE_REVIEW_MODE=off)"}.
          Each approval applies to the exact wording fingerprint shown; editing a template requires a new review.
        </p>
      </div>
      {ok && (
        <Alert variant="success">
          <AlertDescription>Review recorded for {ok}.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Alert variant="info">
        <AlertTitle>Who can approve</AlertTitle>
        <AlertDescription>
          Only record an approval from a lawyer admitted in the template&apos;s jurisdiction who has given written advice on this wording. GlobalCorp Hub staff
          must not approve templates themselves.
        </AlertDescription>
      </Alert>

      {statuses.map(({ template, fingerprint, state, latestReview }) => (
        <Card key={template.id} id={template.id} className="gap-4">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {template.title} <Badge variant={STATE[state].variant}>{STATE[state].label}</Badge>
            </CardTitle>
            <CardDescription className="font-mono text-xs">
              {template.id} · v{template.version} · fingerprint {fingerprint}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <div className="space-y-3 text-sm">
              <Button asChild variant="outline" size="sm">
                <a href={`/api/admin/templates/${template.id}/preview`} target="_blank" rel="noreferrer">
                  <FileText /> Preview with sample company (PDF)
                </a>
              </Button>
              <p className="text-muted-foreground">Check against: {template.sources.join("; ")}</p>
              <ul className="list-disc space-y-1 pl-5">
                {template.checklist.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {latestReview && (
                <p className="rounded-md bg-muted p-2 text-xs">
                  Latest review: {latestReview.status === "APPROVED" ? "approved" : "changes requested"} by {latestReview.reviewerName} ({latestReview.reviewerFirm},{" "}
                  {latestReview.reviewerAdmission}) on {formatDate(latestReview.reviewedAt)} for fingerprint {latestReview.fingerprint}
                  {latestReview.adviceReference && ` · advice ${latestReview.adviceReference}`}
                  {latestReview.notes && ` · “${latestReview.notes}”`}
                </p>
              )}
            </div>
            <form action={`/api/admin/templates/${template.id}/review`} method="post" className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Record a lawyer&apos;s review</p>
              <input type="hidden" name="fingerprint" value={fingerprint} />
              <Field name="reviewerName" label="Lawyer" />
              <Field name="reviewerFirm" label="Firm" />
              <Field name="reviewerAdmission" label="Admission (jurisdiction, certificate no.)" />
              <Field name="adviceReference" label="Advice reference (optional)" required={false} />
              <Field name="reviewedAt" label="Date of advice" type="date" />
              <div className="grid gap-1.5">
                <Label htmlFor={`${template.id}-status`}>Outcome</Label>
                <select id={`${template.id}-status`} name="status" className="h-9 rounded-md border bg-card px-2 text-sm">
                  <option value="APPROVED">Approved as drafted</option>
                  <option value="CHANGES_REQUESTED">Changes requested</option>
                </select>
              </div>
              <Textarea name="notes" rows={2} placeholder="Notes (optional)" />
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" name="confirm" className="mt-0.5" required />I hold this lawyer&apos;s written advice on this exact wording (fingerprint {fingerprint}).
              </label>
              <Button type="submit" size="sm">
                Record review
              </Button>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Field({ name, label, type = "text", required = true }: { name: string; label: string; type?: string; required?: boolean }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input name={name} type={type} required={required} className="h-8" />
    </div>
  );
}
