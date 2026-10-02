"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ defaultEmail, redirectTo, error, devMailbox }: { defaultEmail: string; redirectTo: string; error?: string; devMailbox: boolean }) {
  const [email, setEmail] = useState(defaultEmail);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [message, setMessage] = useState(error);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setMessage(undefined);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, redirectTo }),
    });
    if (res.ok) return setState("sent");
    const body = await res.json().catch(() => null);
    setMessage(body?.error?.message ?? "Couldn't send the sign-in link. Try again.");
    setState("idle");
  };

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>We&apos;ll email you a secure one-time link. No password needed.</CardDescription>
      </CardHeader>
      <CardContent>
        {state === "sent" ? (
          <div className="space-y-3 text-center">
            <MailCheck className="mx-auto size-10 text-success" />
            <p className="font-medium">Check your inbox</p>
            <p className="text-sm text-muted-foreground">
              If {email} can sign in, a link is on its way. It expires in 15 minutes.
            </p>
            {devMailbox && (
              <Button asChild variant="outline" size="sm">
                <Link href="/dev/mailbox">Open dev mailbox</Link>
              </Button>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {message && (
              <Alert variant="destructive">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={state === "sending"}>
              {state === "sending" && <Loader2 className="animate-spin" />} Email me a sign-in link
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
