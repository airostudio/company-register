"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useWizardDispatch, useWizardStore } from "@/lib/wizard/store";

export const STEP_FORM_ID = "wizard-step-form";

export function StepShell({
  title,
  description,
  children,
  nextLabel = "Continue",
  hideNext,
  nextDisabled,
  busy,
  aside,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  nextLabel?: string;
  hideNext?: boolean;
  nextDisabled?: boolean;
  busy?: boolean;
  aside?: ReactNode;
}) {
  const dispatch = useWizardDispatch();
  const currentStep = useWizardStore((s) => s.currentStep);
  const phase = useWizardStore((s) => s.phase);

  return (
    <Card className="gap-5">
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {aside}
      </CardHeader>
      <CardContent className="space-y-6">{children}</CardContent>
      <CardFooter className="justify-between border-t pt-5">
        <Button
          type="button"
          variant="ghost"
          onClick={() => dispatch({ type: "BACK" })}
          disabled={currentStep === "entity" || phase !== "editing"}
        >
          <ArrowLeft /> Back
        </Button>
        {!hideNext && (
          <Button type="submit" form={STEP_FORM_ID} disabled={nextDisabled || busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {nextLabel} {!busy && <ArrowRight />}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

/** Surface the first validation error of an array/root field (e.g. `officers`). */
export function RootError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">{message}</p>;
}
