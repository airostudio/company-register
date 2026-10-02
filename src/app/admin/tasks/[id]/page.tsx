import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { FILING_STATUS_LABELS, OFFICER_ROLE_LABELS } from "@/lib/domain";
import { getEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import type { FormationPayload } from "@/lib/registry/types";
import { formatAddress } from "@/lib/validation/address";
import { formatDate } from "@/lib/utils";
import { db } from "@/server/db";
import { allowedActions, type OpsAction } from "@/server/ops/actions";
import type { OpsTaskDocument } from "@/server/ops/tasks";
import { requireAdmin } from "@/server/session";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OpsStatusBadge } from "@/components/admin/ops-status-badge";

export const metadata: Metadata = { title: "Ops task" };
export const dynamic = "force-dynamic";

export default async function OpsTaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const admin = await requireAdmin();
  if (!admin) notFound();
  const { id } = await params;
  const { ok, error } = await searchParams;
  const task = await db().opsTask.findUnique({ where: { id } });
  if (!task) notFound();
  const [company, filing, assignee] = await Promise.all([
    db().company.findUnique({ where: { id: task.companyId }, include: { owner: { select: { email: true } } } }),
    task.filingId ? db().filing.findUnique({ where: { id: task.filingId } }) : null,
    task.assigneeId ? db().user.findUnique({ where: { id: task.assigneeId }, select: { email: true } }) : null,
  ]);
  const profile = getJurisdiction(task.jurisdiction);
  const actions = allowedActions(task.status);
  const docs = (task.documents as OpsTaskDocument[] | null) ?? [];
  const payload = task.kind === "LODGEMENT" ? (task.payload as unknown as FormationPayload) : undefined;
  const action = `/api/admin/tasks/${task.id}`;
  const resultLabel = task.kind === "LODGEMENT" ? profile.identifiers.companyNumber : profile.identifiers.taxId;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin">
          <ArrowLeft /> Ops console
        </Link>
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {profile.flag} {company?.legalName ?? company?.proposedName}
          </h1>
          <p className="font-mono text-sm text-muted-foreground">
            {task.reference} · {task.kind === "LODGEMENT" ? "Lodgement" : "Tax registration"} with {task.authority}
          </p>
        </div>
        <OpsStatusBadge status={task.status} />
      </div>
      {ok && (
        <Alert variant="success">
          <AlertDescription>Saved. The customer&apos;s tracker has been updated.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What to lodge</CardTitle>
            <CardDescription>
              Customer {company?.owner.email}
              {filing && ` · filing ${FILING_STATUS_LABELS[filing.status].toLowerCase()}`}
              {assignee && ` · assigned to ${assignee.email}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {payload ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/admin/tasks/${task.id}/pack`} target="_blank" rel="noreferrer">
                    <FileText /> Open lodgement pack (PDF)
                  </a>
                </Button>
                <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1.5">
                  <dt className="text-muted-foreground">Name</dt>
                  <dd className="font-medium">{payload.companyName}</dd>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{getEntityProfile(payload.jurisdiction, payload.entityType).label}</dd>
                  <dt className="text-muted-foreground">Priority</dt>
                  <dd>{payload.expedited ? "Expedited" : "Standard"}</dd>
                  <dt className="text-muted-foreground">Registered office</dt>
                  <dd>{formatAddress(payload.registeredOffice)}</dd>
                  <dt className="text-muted-foreground">Officers</dt>
                  <dd>{payload.officers.map((o) => `${o.fullName} (${o.roles.map((r) => OFFICER_ROLE_LABELS[r]).join(", ")})`).join("; ")}</dd>
                  <dt className="text-muted-foreground">Holders</dt>
                  <dd>{payload.shareholders.map((s) => `${s.fullName} — ${s.units.toLocaleString()}`).join("; ")}</dd>
                </dl>
              </>
            ) : (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/admin/tasks/${task.id}/pack`} target="_blank" rel="noreferrer">
                    <FileText /> Open prefilled application (PDF)
                  </a>
                </Button>
                {(task.payload as { sections?: { title: string; fields: [string, string][] }[] }).sections?.map((section) => (
                  <div key={section.title} className="space-y-1">
                    <h3 className="font-medium">{section.title}</h3>
                    <dl className="grid grid-cols-[12rem_1fr] gap-x-4 gap-y-1">
                      {section.fields.map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-muted-foreground">{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </>
            )}
            {task.externalReference && <p>Authority reference: <strong>{task.externalReference}</strong></p>}
            {task.resultNumber && (
              <p>
                {resultLabel}: <strong>{task.resultNumber}</strong> {task.resultDate && `· ${formatDate(task.resultDate)}`}
              </p>
            )}
            {task.message && <p className="rounded-md bg-warning/10 p-2">Customer-facing note: {task.message}</p>}
            {docs.length > 0 && <p>Uploaded: {docs.map((d) => d.title).join(", ")}</p>}
            {task.notes && <pre className="rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{task.notes}</pre>}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {actions.map((a) => (
            <ActionForm key={a} action={a} url={action} resultLabel={resultLabel} kind={task.kind} authority={task.authority} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionForm({ action, url, resultLabel, kind, authority }: { action: OpsAction; url: string; resultLabel: string; kind: string; authority: string }) {
  const titles: Record<OpsAction, string> = {
    claim: "Assign to me",
    lodged: `Mark as lodged with ${authority}`,
    approve: kind === "LODGEMENT" ? "Record registration" : "Record issued number",
    action_required: "Ask the customer for information",
    resume: "Information received — resume",
    reject: "Record rejection",
    note: "Add internal note",
  };
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{titles[action]}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <form action={url} method="post" encType="multipart/form-data" className="space-y-2">
          <input type="hidden" name="action" value={action} />
          {action === "lodged" && <Field name="externalReference" label={`${authority} reference / receipt number`} />}
          {action === "approve" && (
            <>
              <Field name="resultNumber" label={resultLabel} />
              <Field name="resultDate" label="Date issued" type="date" />
              <FileField name="certificate" label={kind === "LODGEMENT" ? "Certificate (PDF, required)" : "Confirmation letter (PDF)"} />
              {kind === "LODGEMENT" && <FileField name="receipt" label="Lodgement receipt (PDF, optional)" />}
            </>
          )}
          {(action === "action_required" || action === "reject") && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${action}-message`}>Message to the customer</Label>
              <Textarea id={`${action}-message`} name="message" required rows={3} />
            </div>
          )}
          {action === "note" && <Textarea name="note" required rows={2} placeholder="Only visible to staff" />}
          <Button type="submit" size="sm" variant={action === "reject" ? "destructive" : action === "note" ? "outline" : "default"}>
            {titles[action]}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ name, label, type = "text" }: { name: string; label: string; type?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required />
    </div>
  );
}

function FileField({ name, label }: { name: string; label: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type="file" accept="application/pdf" />
    </div>
  );
}
