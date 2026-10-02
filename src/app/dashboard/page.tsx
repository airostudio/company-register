import type { Metadata } from "next";
import Link from "next/link";
import { Building, Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CompanyPanel } from "@/components/dashboard/company-panel";
import { getDashboard, getFilingView } from "@/server/queries";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirectTo=/dashboard");
  const userId = user.id;

  let companies: Awaited<ReturnType<typeof getDashboard>>;
  try {
    companies = await getDashboard(userId);
  } catch (error) {
    console.error(error);
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load your companies</AlertTitle>
        <AlertDescription>Check that the database is running and DATABASE_URL is set.</AlertDescription>
      </Alert>
    );
  }
  if (!companies.length) return <EmptyState />;
  const unverified = !user.emailVerifiedAt;

  const filingViews = await Promise.all(
    companies.map((c) => (c.filings[0] ? getFilingView(c.filings[0].id, userId) : Promise.resolve(null))),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Your companies</h1>
          <p className="text-sm text-muted-foreground">Status, documents and upcoming obligations in one place.</p>
        </div>
        <Button asChild>
          <Link href="/register">
            <Plus /> New company
          </Link>
        </Button>
      </div>
      {unverified && (
        <Alert variant="warning">
          <AlertTitle>Confirm your email address</AlertTitle>
          <AlertDescription>
            We sent a confirmation link to {user.email}. Until it&apos;s confirmed, you can only access this account from this browser.
          </AlertDescription>
        </Alert>
      )}
      {companies.map((company, i) => (
        <CompanyPanel key={company.id} company={company} filing={filingViews[i] ?? undefined} />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="mx-auto max-w-lg text-center">
      <CardContent className="space-y-4 py-6">
        <Building className="mx-auto size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">No companies yet</h1>
        <p className="text-sm text-muted-foreground">Register your first company — it takes about 10 minutes.</p>
        <Button asChild>
          <Link href="/register">Start a company</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
