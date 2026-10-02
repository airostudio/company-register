import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { OpsTaskKind, OpsTaskStatus } from "@prisma/client";
import { getJurisdiction } from "@/lib/jurisdictions";
import { formatDate } from "@/lib/utils";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpsStatusBadge } from "@/components/admin/ops-status-badge";

export const metadata: Metadata = { title: "Ops console" };
export const dynamic = "force-dynamic";

const OPEN_STATUSES: OpsTaskStatus[] = ["OPEN", "IN_PROGRESS", "SUBMITTED", "ACTION_REQUIRED"];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ view?: string; kind?: string }> }) {
  if (!(await requireAdmin())) notFound();
  const { view = "open", kind } = await searchParams;
  const kindFilter = kind === "LODGEMENT" || kind === "TAX_REGISTRATION" ? (kind as OpsTaskKind) : undefined;
  const tasks = await db().opsTask.findMany({
    where: { ...(view === "open" ? { status: { in: OPEN_STATUSES } } : {}), ...(kindFilter ? { kind: kindFilter } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const companies = await db().company.findMany({
    where: { id: { in: tasks.map((t) => t.companyId) } },
    select: { id: true, proposedName: true, legalName: true },
  });
  const names = new Map(companies.map((c) => [c.id, c.legalName ?? c.proposedName]));
  const filters = [
    { label: "Open", href: "/admin?view=open" },
    { label: "Lodgements", href: "/admin?view=open&kind=LODGEMENT" },
    { label: "Tax registrations", href: "/admin?view=open&kind=TAX_REGISTRATION" },
    { label: "All", href: "/admin?view=all" },
    { label: "Legal templates", href: "/admin/templates" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ops console</h1>
        <p className="text-sm text-muted-foreground">Filings that registries and tax authorities don&apos;t accept by API. Oldest first.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Button key={f.href} asChild variant="outline" size="sm">
            <Link href={f.href}>{f.label}</Link>
          </Button>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tasks.length} task{tasks.length === 1 ? "" : "s"}</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting. 🎉</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {tasks.map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/tasks/${t.id}`} className="grid gap-1 px-3 py-2.5 text-sm hover:bg-muted sm:grid-cols-[11rem_1fr_auto_auto] sm:items-center sm:gap-4">
                    <span className="font-mono text-xs">{t.reference}</span>
                    <span>
                      {getJurisdiction(t.jurisdiction).flag} {names.get(t.companyId) ?? t.companyId}
                      <span className="ml-2 text-xs text-muted-foreground">{t.kind === "LODGEMENT" ? "Lodgement" : "Tax registration"} · {t.authority}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(t.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                    <span className="flex items-center gap-2">
                      {(t.payload as { expedited?: boolean }).expedited && <Badge variant="warning">Expedited</Badge>}
                      <OpsStatusBadge status={t.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
