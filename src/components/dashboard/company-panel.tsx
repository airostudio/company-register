import { CalendarClock, Download, Eye, FileText, FolderLock, History, Landmark, Users } from "lucide-react";
import type { FilingView } from "@/lib/api-types";
import {
  DOCUMENT_TYPE_LABELS,
  FILING_STATUS_LABELS,
  OFFICER_ROLE_LABELS,
  type ComplianceEventStatus,
  type CompanyStatus,
  type OfficerRole,
} from "@/lib/domain";
import { getEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import { PLANS } from "@/lib/pricing/catalog";
import { formatAddress, type Address } from "@/lib/validation/address";
import { formatDate, formatMoney } from "@/lib/utils";
import type { DashboardCompany } from "@/server/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LodgementTracker } from "@/components/shared/lodgement-tracker";

const COMPANY_STATUS: Record<CompanyStatus, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SUBMITTED: { label: "Submitted to Registry", variant: "default" },
  UNDER_REVIEW: { label: "Under Review", variant: "warning" },
  ACTIVE: { label: "Active", variant: "success" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  DEREGISTERED: { label: "Deregistered", variant: "secondary" },
};

const COMPLIANCE_BADGE: Record<ComplianceEventStatus, { label: string; variant: "secondary" | "warning" | "destructive" | "success" }> = {
  UPCOMING: { label: "Upcoming", variant: "secondary" },
  DUE_SOON: { label: "Due soon", variant: "warning" },
  OVERDUE: { label: "Overdue", variant: "destructive" },
  COMPLETED: { label: "Done", variant: "success" },
};

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export function CompanyPanel({ company, filing }: { company: DashboardCompany; filing?: FilingView }) {
  const profile = getJurisdiction(company.jurisdiction);
  const entity = getEntityProfile(company.jurisdiction, company.entityType);
  const status = COMPANY_STATUS[company.status];
  const registryDocs = company.documents.filter((d) => d.source === "REGISTRY");
  const generatedDocs = company.documents.filter((d) => d.source !== "REGISTRY");
  const plan = company.subscription ? PLANS[company.subscription.plan] : undefined;
  const nextDue = company.complianceEvents.find((e) => e.status !== "COMPLETED");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <span className="text-2xl">{profile.flag}</span>
          {company.legalName ?? company.proposedName}
        </CardTitle>
        <CardDescription>
          {entity.label} · {profile.registry.name}
          {company.registryNumber && ` · ${profile.identifiers.companyNumber} ${company.registryNumber}`}
          {company.incorporatedAt && ` · Incorporated ${formatDate(company.incorporatedAt)}`}
        </CardDescription>
        <CardAction>
          <Badge variant={status.variant}>{status.label}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        {filing && <LodgementTracker filingId={filing.id} initial={filing} compact />}

        {nextDue && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <CalendarClock className="size-4 text-primary" />
            Next: <strong>{nextDue.title}</strong> due {formatDate(nextDue.dueDate, { dateStyle: "long" })}
            <Badge variant={COMPLIANCE_BADGE[nextDue.status].variant}>{COMPLIANCE_BADGE[nextDue.status].label}</Badge>
          </div>
        )}

        <Tabs defaultValue="documents">
          <TabsList>
            <TabsTrigger value="documents">
              <FolderLock /> Documents <Badge variant="secondary">{company.documents.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="compliance">
              <CalendarClock /> Compliance
            </TabsTrigger>
            <TabsTrigger value="filings">
              <History /> Filings
            </TabsTrigger>
            <TabsTrigger value="details">
              <Users /> Details
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-5">
            {company.documents.length === 0 && (
              <p className="text-sm text-muted-foreground">Documents appear here once {profile.registry.code} approves the registration.</p>
            )}
            {[
              { title: `Issued by ${profile.registry.name}`, icon: Landmark, docs: registryDocs },
              { title: "Company legal pack", icon: FileText, docs: generatedDocs },
            ]
              .filter((g) => g.docs.length)
              .map((group) => (
                <div key={group.title} className="space-y-2">
                  <h4 className="flex items-center gap-2 text-sm font-semibold">
                    <group.icon className="size-4" /> {group.title}
                  </h4>
                  <ul className="divide-y rounded-md border">
                    {group.docs.map((doc) => (
                      <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span>
                          <span className="font-medium">{doc.title}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {DOCUMENT_TYPE_LABELS[doc.type]} · PDF {formatBytes(doc.sizeBytes)}
                          </span>
                        </span>
                        <span className="flex gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <a href={`/api/documents/${doc.id}`} target="_blank" rel="noreferrer">
                              <Eye /> View
                            </a>
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <a href={`/api/documents/${doc.id}?download=1`}>
                              <Download /> Download
                            </a>
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </TabsContent>

          <TabsContent value="compliance" className="space-y-3">
            {plan ? (
              <p className="text-sm text-muted-foreground">
                Covered by <strong className="text-foreground">{plan.name}</strong> — we&apos;ll prepare and lodge these for you. Renews{" "}
                {formatDate(company.subscription!.currentPeriodEnd)}.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">We&apos;ll email reminders before each deadline. Upgrade to have them lodged for you.</p>
            )}
            {company.complianceEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Your compliance calendar is created when the company is registered.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {company.complianceEvents.map((event) => (
                  <li key={event.id} className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[8rem_1fr_auto] sm:items-center sm:gap-4">
                    <span className="font-medium tabular-nums">{formatDate(event.dueDate)}</span>
                    <span>
                      <span className="font-medium">{event.title}</span>
                      <span className="block text-xs text-muted-foreground">{event.description}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {event.feeEstimate ? (
                        <span className="text-xs text-muted-foreground">~{formatMoney(event.feeEstimate, profile.currency)}</span>
                      ) : null}
                      <Badge variant={COMPLIANCE_BADGE[event.status].variant}>{COMPLIANCE_BADGE[event.status].label}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="filings" className="space-y-4">
            {company.filings.map((f) => (
              <div key={f.id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {f.type.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                    {f.registryReference && <span className="ml-2 font-mono text-xs text-muted-foreground">{f.registryReference}</span>}
                  </span>
                  <Badge variant="outline">{FILING_STATUS_LABELS[f.status]}</Badge>
                </div>
                <ol className="space-y-1 border-l pl-4 text-xs">
                  {f.events.map((e) => (
                    <li key={e.id}>
                      <span className="text-muted-foreground">{formatDate(e.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span> —{" "}
                      {e.message}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="details" className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="space-y-1">
              <h4 className="font-semibold">{company.useRegisteredAgent && profile.country === "US" ? "Registered agent" : "Registered office"}</h4>
              {company.registeredAgentName && <p>{company.registeredAgentName}</p>}
              <p className="text-muted-foreground">{formatAddress(company.registeredAddress as unknown as Address)}</p>
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold">Officers</h4>
              {company.officers.map((o) => (
                <p key={o.fullName}>
                  {o.fullName} <span className="text-muted-foreground">— {(o.roles as OfficerRole[]).map((r) => OFFICER_ROLE_LABELS[r]).join(", ")}</span>
                </p>
              ))}
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold">{profile.identifiers.taxId}</h4>
              <p className="text-muted-foreground">{company.taxId ?? "Not yet issued"}</p>
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold">Business activity</h4>
              <p className="text-muted-foreground">{company.businessActivity}</p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
