"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, LayoutDashboard, Loader2, Lock, RotateCcw, XCircle } from "lucide-react";
import type { ApiErrorBody, CreateFormationResponse } from "@/lib/api-types";
import { composeCompanyName, getJurisdiction } from "@/lib/jurisdictions";
import { calculateQuote } from "@/lib/pricing/quote";
import { formatMoney } from "@/lib/utils";
import { FORM_STEPS, WIZARD_STEPS, toApplication, type FormStepId } from "@/lib/wizard/machine";
import { useWizardDispatch, useWizardStore } from "@/lib/wizard/store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { LodgementTracker } from "@/components/shared/lodgement-tracker";
import { PriceSummary } from "../price-summary";

type Issue = { path: string; message: string };

function signInHref(email: string) {
  return `/login?${new URLSearchParams({ email, redirectTo: "/register" })}`;
}

export function CheckoutStep() {
  const dispatch = useWizardDispatch();
  const { draft, phase, submission, submitError } = useWizardStore();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [errorCode, setErrorCode] = useState<string>();
  const returnState = useCheckoutReturn();

  if (phase === "submitted" && submission) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Your application</CardTitle>
          <CardDescription>
            This page updates live — you can also close it and follow along from your dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {returnState === "cancelled" && (
            <Alert variant="warning">
              <XCircle />
              <AlertTitle>Payment cancelled</AlertTitle>
              <AlertDescription>Your application is saved. Complete payment whenever you&apos;re ready and we&apos;ll lodge it straight away.</AlertDescription>
            </Alert>
          )}
          <LodgementTracker key={returnState} filingId={submission.filingId} />
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-2 border-t pt-5">
          <Button variant="ghost" onClick={() => dispatch({ type: "RESET" })}>
            <RotateCcw /> Register another company
          </Button>
          <Button asChild>
            <Link href="/dashboard">
              <LayoutDashboard /> Go to dashboard
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const app = toApplication(draft);
  if (!app) {
    return (
      <Alert variant="warning">
        <XCircle />
        <AlertTitle>Some details are missing</AlertTitle>
        <AlertDescription>Go back and complete the earlier steps.</AlertDescription>
      </Alert>
    );
  }
  const profile = getJurisdiction(app.entity.jurisdiction);
  const quote = calculateQuote({
    jurisdiction: app.entity.jurisdiction,
    entityType: app.entity.entityType,
    addOns: app.addons.addOns,
    plan: app.addons.plan,
    useAddressService: app.details.useAddressService,
  });
  const submitting = phase === "submitting";

  const submit = async () => {
    setIssues([]);
    dispatch({ type: "SUBMIT" });
    try {
      const res = await fetch("/api/formations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(app),
      });
      const body = (await res.json()) as CreateFormationResponse | ApiErrorBody;
      if (!res.ok || "error" in body) {
        const err = (body as ApiErrorBody).error;
        setIssues((err?.issues ?? []).map((i) => ({ path: i.path ?? i.field ?? "", message: i.message })));
        setErrorCode(err?.code);
        dispatch({ type: "SUBMIT_FAILED", error: err?.message ?? `Submission failed (${res.status})` });
        return;
      }
      dispatch({
        type: "SUBMIT_SUCCEEDED",
        submission: { companyId: body.companyId, filingId: body.filingId, submittedAt: new Date().toISOString() },
      });
      if (body.checkoutUrl) window.location.assign(body.checkoutUrl);
    } catch {
      dispatch({ type: "SUBMIT_FAILED", error: "Network error — check your connection and try again." });
    }
  };

  const stepFor = (path: string): FormStepId | undefined => FORM_STEPS.find((s) => path.startsWith(`${s}.`) || path === s);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Checkout</CardTitle>
        <CardDescription>
          {composeCompanyName(app.name.baseName, app.name.suffix)} · {profile.flag} {profile.name}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {submitError && (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>{submitError}</AlertTitle>
            {errorCode === "ACCOUNT_EXISTS" && (
              <AlertDescription>
                <p>Your progress is saved — sign in and you&apos;ll come straight back here.</p>
                <Button asChild size="sm" className="mt-2">
                  <Link href={signInHref(app.review.contactEmail)}>Sign in to continue</Link>
                </Button>
              </AlertDescription>
            )}
            {issues.length > 0 && (
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {issues.map((i) => {
                    const step = stepFor(i.path);
                    return (
                      <li key={`${i.path}-${i.message}`}>
                        {i.message}
                        {step && (
                          <Button variant="link" size="sm" className="h-auto px-1" onClick={() => dispatch({ type: "GOTO", step })}>
                            Fix in {WIZARD_STEPS.find((w) => w.id === step)?.short}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </AlertDescription>
            )}
          </Alert>
        )}
        <div className="rounded-lg border bg-muted/30 p-4">
          <PriceSummary quote={quote} />
        </div>
        <div className="space-y-2 rounded-lg border p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CreditCard className="size-4" /> Payment
          </p>
          <p className="text-sm text-muted-foreground">
            You&apos;ll pay securely with Stripe. Government fees are passed through at cost and itemised on your receipt.
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2 border-t pt-5">
        <Button variant="ghost" disabled={submitting} onClick={() => dispatch({ type: "BACK" })}>
          Back
        </Button>
        <Button size="lg" onClick={submit} disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <Lock />}
          Pay {formatMoney(quote.totals.dueToday, quote.currency)} & lodge
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * Handle the return from Stripe Checkout (?checkout=success&session_id=… or ?checkout=cancelled):
 * confirm the session server-side in case the webhook hasn't arrived, then clean the URL.
 */
function useCheckoutReturn(): "none" | "success" | "cancelled" {
  const [state, setState] = useState<"none" | "success" | "cancelled">("none");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (outcome !== "success" && outcome !== "cancelled") return;
    window.history.replaceState(null, "", window.location.pathname);
    const sessionId = params.get("session_id");
    if (outcome === "success" && sessionId) {
      void fetch(`/api/payments/confirm?session_id=${encodeURIComponent(sessionId)}`).finally(() => setState("success"));
    } else {
      setState(outcome);
    }
  }, []);
  return state;
}
