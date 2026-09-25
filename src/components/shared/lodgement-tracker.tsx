"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, FileText, Loader2, XCircle } from "lucide-react";
import type { FilingView } from "@/lib/api-types";
import { FILING_STATUS_LABELS, LIFECYCLE_LABELS, LIFECYCLE_STAGES, filingStatusToLifecycle } from "@/lib/domain";
import { getJurisdiction } from "@/lib/jurisdictions";
import { cn, formatDate } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const POLL_MS = 2_500;

/** Live lodgement progress: Draft → Submitted → Under review → Approved, with the registry event log. */
export function LodgementTracker({ filingId, initial, compact }: { filingId: string; initial?: FilingView; compact?: boolean }) {
  const [view, setView] = useState<FilingView | undefined>(initial);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/filings/${filingId}`, { cache: "no-store" });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
        setView(body as FilingView);
        setError(undefined);
        // Keep polling until settled and (if approved) the document pack has landed.
        const done = (body as FilingView).settled && ((body as FilingView).status !== "APPROVED" || (body as FilingView).documents.length > 0);
        if (!done) timer = setTimeout(poll, POLL_MS);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't load status");
        timer = setTimeout(poll, POLL_MS * 2);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filingId]);

  if (!view) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {error ?? "Loading lodgement status…"}
      </p>
    );
  }

  const profile = getJurisdiction(view.company.jurisdiction);
  const stage = filingStatusToLifecycle(view.status);
  const stageIndex = LIFECYCLE_STAGES.indexOf(stage);
  const failed = view.status === "REJECTED" || view.status === "FAILED";
  const needsAction = view.status === "REQUIRES_ACTION";
  const inFlight = !view.settled;

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Progress
          value={((stageIndex + (view.status === "APPROVED" ? 1 : 0.5)) / LIFECYCLE_STAGES.length) * 100}
          indicatorClassName={failed ? "bg-destructive" : needsAction ? "bg-warning" : view.status === "APPROVED" ? "bg-success" : undefined}
        />
        <ol className="grid grid-cols-4 gap-2 text-xs">
          {LIFECYCLE_STAGES.map((s, i) => {
            const done = i < stageIndex || view.status === "APPROVED";
            const current = i === stageIndex && view.status !== "APPROVED";
            return (
              <li key={s} className={cn("flex items-center gap-1.5", done || current ? "text-foreground" : "text-muted-foreground")}>
                {done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                ) : current && inFlight ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                ) : current && failed ? (
                  <XCircle className="size-4 shrink-0 text-destructive" />
                ) : current && needsAction ? (
                  <AlertTriangle className="size-4 shrink-0 text-warning" />
                ) : (
                  <Circle className="size-4 shrink-0" />
                )}
                <span className="leading-tight">{LIFECYCLE_LABELS[s]}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {view.status === "APPROVED" && (
        <Alert variant="success">
          <CheckCircle2 />
          <AlertTitle>{view.company.name} is registered</AlertTitle>
          <AlertDescription>
            {profile.identifiers.companyNumber} {view.company.registryNumber} · {view.decidedAt && formatDate(view.decidedAt, { dateStyle: "long" })}
          </AlertDescription>
        </Alert>
      )}
      {(needsAction || failed) && view.error && (
        <Alert variant={failed ? "destructive" : "warning"}>
          <AlertTriangle />
          <AlertTitle>{FILING_STATUS_LABELS[view.status]}</AlertTitle>
          <AlertDescription>
            <p>{view.error.message}</p>
            {needsAction && <p>Our team has been notified and will contact you to resolve this with {profile.registry.code}.</p>}
          </AlertDescription>
        </Alert>
      )}

      {!compact && (
        <ol className="relative space-y-3 border-l pl-5">
          {view.events.map((e) => (
            <li key={e.id} className="text-sm">
              <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-card bg-primary" />
              <p className="font-medium">{FILING_STATUS_LABELS[e.status]}</p>
              <p className="text-muted-foreground">{e.message}</p>
              <p className="text-xs text-muted-foreground">{formatDate(e.createdAt, { dateStyle: "medium", timeStyle: "medium" })}</p>
            </li>
          ))}
          {inFlight && (
            <li className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Waiting for {profile.registry.code}…
            </li>
          )}
        </ol>
      )}

      {view.status === "APPROVED" && view.documents.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Generating your document pack…
        </p>
      )}
      {!compact && view.documents.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Your documents</h4>
          <ul className="grid gap-2 sm:grid-cols-2">
            {view.documents.map((d) => (
              <li key={d.id}>
                <Button asChild variant="outline" className="h-auto w-full justify-start py-2 text-left whitespace-normal">
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">
                    <FileText className="text-primary" />
                    <span className="text-sm">{d.title}</span>
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-xs text-destructive">Connection issue: {error}. Retrying…</p>}
    </div>
  );
}
