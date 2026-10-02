"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, CreditCard, FileText, Loader2, PenLine, Send, XCircle } from "lucide-react";
import type { FilingView } from "@/lib/api-types";
import { FILING_STATUS_LABELS, LIFECYCLE_LABELS, LIFECYCLE_STAGES, filingStatusToLifecycle, type Currency } from "@/lib/domain";
import { getJurisdiction } from "@/lib/jurisdictions";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
        const v = body as FilingView;
        const done = v.settled && (v.status !== "APPROVED" || v.packReady);
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
  // DRAFT waits on payment and AWAITING_SIGNATURES on officers — not on the registry.
  const inFlight = !view.settled && view.status !== "DRAFT" && view.status !== "AWAITING_SIGNATURES";

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

      {view.status === "DRAFT" && view.payment && view.payment.status !== "PAID" && (
        <Alert variant="warning">
          <CreditCard />
          <AlertTitle>Awaiting payment</AlertTitle>
          <AlertDescription>
            <p>We&apos;ll lodge with {profile.registry.code} as soon as payment of {formatMoney(view.payment.amount, view.payment.currency as Currency)} is complete.</p>
            <PayButton filingId={view.id} />
          </AlertDescription>
        </Alert>
      )}
      {view.signatures.length > 0 && view.status === "AWAITING_SIGNATURES" && <SignaturesPanel view={view} />}
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

      {view.status === "APPROVED" && !view.packReady && (
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

function PayButton({ filingId }: { filingId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pay = async () => {
    setBusy(true);
    setError(undefined);
    const res = await fetch(`/api/filings/${filingId}/checkout`, { method: "POST" });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.checkoutUrl) return window.location.assign(body.checkoutUrl);
    if (!res.ok) setError(body?.error?.message ?? "Couldn't start checkout");
    setBusy(false);
  };
  return (
    <div className="mt-2 space-y-1">
      <Button size="sm" onClick={pay} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <CreditCard />} Complete payment
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const SIGNATURE_BADGE = {
  PENDING: { label: "Waiting", variant: "secondary" },
  SIGNED: { label: "Signed", variant: "success" },
  DECLINED: { label: "Declined", variant: "destructive" },
  EXPIRED: { label: "Link expired", variant: "warning" },
} as const;

function SignaturesPanel({ view }: { view: FilingView }) {
  const signed = view.signatures.filter((s) => s.status === "SIGNED").length;
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <PenLine className="size-4 text-primary" /> Officer consents ({signed} of {view.signatures.length} signed)
        </p>
        <p className="text-xs text-muted-foreground">We lodge as soon as everyone has signed.</p>
      </div>
      <ul className="divide-y rounded-md border text-sm">
        {view.signatures.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span>
              <span className="font-medium">{s.signerName}</span>
              <span className="ml-2 text-xs text-muted-foreground">{s.signerEmail}</span>
            </span>
            <span className="flex items-center gap-2">
              <Badge variant={SIGNATURE_BADGE[s.status].variant}>{SIGNATURE_BADGE[s.status].label}</Badge>
              {s.canSignHere && (
                <Button asChild size="sm">
                  <Link href={`/sign/request/${s.id}`}>Sign now</Link>
                </Button>
              )}
              {(s.status === "PENDING" || s.status === "EXPIRED") && <ResendButton filingId={view.id} signatureId={s.id} />}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResendButton({ filingId, signatureId }: { filingId: string; signatureId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const resend = async () => {
    setState("busy");
    const res = await fetch(`/api/filings/${filingId}/signatures/${signatureId}/resend`, { method: "POST" });
    setState(res.ok ? "sent" : "error");
  };
  return (
    <Button size="sm" variant="ghost" onClick={resend} disabled={state === "busy" || state === "sent"}>
      {state === "busy" ? <Loader2 className="animate-spin" /> : <Send />}
      {state === "sent" ? "Sent" : state === "error" ? "Retry" : "Resend link"}
    </Button>
  );
}
