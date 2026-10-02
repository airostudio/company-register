"use client";

import { useState } from "react";
import { CheckCircle2, FileText, Loader2, PenLine, XCircle } from "lucide-react";
import type { SigningViewModel } from "@/server/signatures/view";
import { formatDate } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Auth = { token: string } | { requestId: string };

export function SignConsent({ view, auth, documentUrl }: { view: SigningViewModel; auth: Auth; documentUrl: string }) {
  const [typedName, setTypedName] = useState("");
  const [agree, setAgree] = useState(false);
  const [mode, setMode] = useState<"sign" | "decline">("sign");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "signed" | "declined">(
    view.status === "SIGNED" ? "signed" : view.status === "DECLINED" ? "declined" : "idle",
  );
  const [error, setError] = useState<string>();

  const submit = async (action: "sign" | "decline") => {
    setState("busy");
    setError(undefined);
    const res = await fetch("/api/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...auth, action, typedName, agree, reason }),
    });
    if (res.ok) return setState(action === "sign" ? "signed" : "declined");
    const body = await res.json().catch(() => null);
    setError(body?.error?.message ?? "Something went wrong. Please try again.");
    setState("idle");
  };

  if (state === "signed") {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <CardContent className="space-y-3 py-6">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <h1 className="text-xl font-semibold">Signed — thank you</h1>
          <p className="text-sm text-muted-foreground">
            Your consent to act as {view.roles.toLowerCase()} of {view.companyName} is recorded. We&apos;ll lodge the registration once everyone has signed.
          </p>
        </CardContent>
      </Card>
    );
  }
  if (state === "declined") {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <CardContent className="space-y-3 py-6">
          <XCircle className="mx-auto size-12 text-muted-foreground" />
          <h1 className="text-xl font-semibold">You&apos;ve declined</h1>
          <p className="text-sm text-muted-foreground">We&apos;ve let the person registering {view.companyName} know. You won&apos;t be appointed.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle className="text-xl">Consent to act as {view.roles}</CardTitle>
        <CardDescription>
          {view.companyName} · {view.jurisdictionName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {view.expired && (
          <Alert variant="warning">
            <AlertTitle>This link has expired</AlertTitle>
            <AlertDescription>Ask the person registering the company to send you a new one.</AlertDescription>
          </Alert>
        )}
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">
          {view.statements.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={documentUrl} target="_blank" rel="noreferrer">
            <FileText /> View the consent document (PDF)
          </a>
        </Button>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {mode === "sign" ? (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="typedName">Type your full legal name to sign</Label>
              <Input
                id="typedName"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={view.signerName}
                autoComplete="name"
                className="h-12 font-serif text-xl italic"
                disabled={view.expired}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={agree} onCheckedChange={(v) => setAgree(v === true)} disabled={view.expired} />
              I agree that typing my name is my electronic signature, and that it has the same effect as signing on paper.
            </label>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="reason">Reason for declining (optional, shared with the person registering the company)</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Document fingerprint (SHA-256): <span className="font-mono break-all">{view.documentHash}</span>. We record the time, your IP address and browser with your signature.
          {view.signedAt && ` Signed ${formatDate(view.signedAt)}.`}
        </p>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2 border-t pt-5">
        {mode === "sign" ? (
          <>
            <Button variant="ghost" onClick={() => setMode("decline")} disabled={state === "busy" || view.expired}>
              I don&apos;t agree to act
            </Button>
            <Button onClick={() => submit("sign")} disabled={state === "busy" || view.expired || !typedName.trim() || !agree}>
              {state === "busy" ? <Loader2 className="animate-spin" /> : <PenLine />} Sign consent
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setMode("sign")} disabled={state === "busy"}>
              Back
            </Button>
            <Button variant="destructive" onClick={() => submit("decline")} disabled={state === "busy"}>
              {state === "busy" && <Loader2 className="animate-spin" />} Decline to act
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
