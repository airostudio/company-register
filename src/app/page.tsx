import Link from "next/link";
import { ArrowRight, CalendarClock, FileText, Landmark, Search, ShieldCheck, Zap } from "lucide-react";
import { listJurisdictions } from "@/lib/jurisdictions";
import { FORMATION_SERVICE_FEE } from "@/lib/pricing/catalog";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  { icon: Search, title: "Instant name check", body: "Search ASIC, US Secretaries of State and Companies House as you type — and see where else your name is free." },
  { icon: Zap, title: "Lodged in minutes", body: "A guided wizard that saves as you go, then lodges straight with the registry and tracks it live." },
  { icon: FileText, title: "Legal pack included", body: "Constitution, bylaws or operating agreement, share certificates, registers and consents — generated automatically." },
  { icon: Landmark, title: "Transparent pricing", body: "Government filing fees are passed through at cost and shown separately from our service fee." },
  { icon: CalendarClock, title: "Compliance calendar", body: "Annual reviews, reports and franchise tax reminders — or let our compliance plan lodge them for you." },
  { icon: ShieldCheck, title: "Founders anywhere", body: "Registered agents, virtual offices and EINs without an SSN for non-resident founders." },
];

export default function HomePage() {
  return (
    <div className="space-y-16 py-6">
      <section className="space-y-6 text-center">
        <Badge variant="secondary">Australia · Delaware · Wyoming · United Kingdom</Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">Register your company anywhere, in minutes.</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          One wizard for a Pty Ltd, LLC, C-Corp or Ltd — with instant name checks, automatic legal documents and live lodgement tracking.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/register">
              Start your company <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/dashboard">View dashboard</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {listJurisdictions().map((j) => (
          <Card key={j.code} className="gap-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-2xl">{j.flag}</span> {j.shortName}
              </CardTitle>
              <CardDescription>{j.registry.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {j.entityTypes.map((e) => (
                <div key={e.type} className="flex justify-between">
                  <span>{e.shortLabel}</span>
                  <span className="text-muted-foreground">
                    {formatMoney(e.governmentFee, j.currency)} gov + {formatMoney(FORMATION_SERVICE_FEE[j.currency], j.currency)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="space-y-2">
            <f.icon className="size-6 text-primary" />
            <h3 className="font-semibold">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
