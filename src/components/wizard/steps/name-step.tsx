"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, Loader2, Search, XCircle } from "lucide-react";
import type { NameCheckResponse } from "@/lib/api-types";
import { JURISDICTIONS } from "@/lib/domain";
import { composeCompanyName, getEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import { COMPANY_NAME_CHARS, LEGAL_ENDING_REGEX, stripLegalEnding } from "@/lib/names";
import { createNameStepSchema, type NameStep as NameValues } from "@/lib/validation/formation";
import { defaultNameStep, selectedEntity } from "@/lib/wizard/machine";
import { useWizardDispatch, useWizardStore } from "@/lib/wizard/store";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpTip } from "../help-tip";
import { STEP_FORM_ID, StepShell } from "../step-shell";
import { useAutoSave } from "../use-auto-save";

type CheckState =
  | { kind: "idle" }
  | { kind: "checking"; name: string }
  | { kind: "done"; name: string; data: NameCheckResponse }
  | { kind: "error"; name: string; message: string };

const DEBOUNCE_MS = 450;

export function NameStep() {
  const dispatch = useWizardDispatch();
  const draft = useWizardStore((s) => s.draft);
  const entity = selectedEntity(draft)!;
  const profile = getJurisdiction(entity.jurisdiction);
  const entityProfile = getEntityProfile(entity.jurisdiction, entity.entityType);
  const schema = useMemo(() => createNameStepSchema(entity.jurisdiction, entity.entityType), [entity.jurisdiction, entity.entityType]);

  const form = useForm<NameValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...defaultNameStep(entity.jurisdiction, entity.entityType), ...draft.name },
  });
  useAutoSave("name", form);

  const baseName = useWatch({ control: form.control, name: "baseName" }) ?? "";
  const suffix = useWatch({ control: form.control, name: "suffix" });
  const fullName = composeCompanyName(baseName, suffix ?? "");
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });
  const latest = useRef(0);

  // Debounced live availability search against the registry.
  useEffect(() => {
    const trimmed = baseName.trim();
    if (trimmed.length < 2 || !COMPANY_NAME_CHARS.test(trimmed) || LEGAL_ENDING_REGEX.test(trimmed)) {
      setCheck({ kind: "idle" });
      return;
    }
    const requestId = ++latest.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setCheck({ kind: "checking", name: fullName });
      const params = new URLSearchParams({
        name: fullName,
        jurisdiction: entity.jurisdiction,
        entityType: entity.entityType,
        also: JURISDICTIONS.filter((j) => j !== entity.jurisdiction).join(","),
      });
      try {
        const res = await fetch(`/api/names/check?${params}`, { signal: controller.signal });
        const body = await res.json();
        if (requestId !== latest.current) return;
        if (!res.ok) throw new Error(body?.error?.message ?? "Name search failed");
        const data = body as NameCheckResponse;
        setCheck({ kind: "done", name: fullName, data });
        form.setValue(
          "availability",
          { checkedName: data.result.query, available: data.result.available, checkedAt: data.result.checkedAt },
          { shouldValidate: form.formState.isSubmitted, shouldDirty: true },
        );
      } catch (error) {
        if (controller.signal.aborted || requestId !== latest.current) return;
        setCheck({ kind: "error", name: fullName, message: error instanceof Error ? error.message : "Name search failed" });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [baseName, fullName, entity.jurisdiction, entity.entityType, form]);

  const applySuggestion = (name: string) => {
    form.setValue("baseName", stripLegalEnding(name), { shouldDirty: true });
  };

  const result = check.kind === "done" ? check.data.result : undefined;
  const warnings = result?.issues.filter((i) => i.severity === "warning" && i.code !== "MISSING_LEGAL_ENDING") ?? [];

  return (
    <StepShell
      title="Choose your company name"
      description={`We search the ${profile.registry.name} register as you type.`}
      nextDisabled={check.kind === "checking"}
    >
      <Form {...form}>
        <form
          id={STEP_FORM_ID}
          className="space-y-6"
          onSubmit={form.handleSubmit((values) => {
            dispatch({ type: "SAVE_STEP", step: "name", values });
            dispatch({ type: "NEXT" });
          })}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <FormField
              control={form.control}
              name="baseName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company name</FormLabel>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <FormControl>
                      <Input className="h-11 pl-9 text-base" placeholder="e.g. Harbourview Robotics" autoFocus autoComplete="off" {...field} />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="suffix"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Legal ending</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {entityProfile.suffixes.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div aria-live="polite" className="min-h-16">
            {check.kind === "checking" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Searching the {profile.registry.code} register for “{check.name}”…
              </p>
            )}
            {check.kind === "error" && (
              <Alert variant="destructive">
                <XCircle />
                <AlertTitle>Couldn&apos;t check the name</AlertTitle>
                <AlertDescription>{check.message}. Keep typing to retry.</AlertDescription>
              </Alert>
            )}
            {result && result.status === "AVAILABLE" && (
              <Alert variant="success">
                <CheckCircle2 />
                <AlertTitle>“{result.query}” is available</AlertTitle>
                <AlertDescription>
                  {warnings.length ? (
                    <ul className="list-disc pl-4">
                      {warnings.map((w) => (
                        <li key={w.message}>{w.message}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No identical names on the register. We&apos;ll reserve it when you lodge.</p>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {result && result.status !== "AVAILABLE" && (
              <Alert variant={result.status === "INVALID" ? "warning" : "destructive"}>
                {result.status === "INVALID" ? <AlertTriangle /> : <XCircle />}
                <AlertTitle>“{result.query}” {result.status === "INVALID" ? "can't be registered" : "is taken"}</AlertTitle>
                <AlertDescription>
                  {result.issues
                    .filter((i) => i.severity === "error")
                    .map((i) => (
                      <p key={i.message}>{i.message}</p>
                    ))}
                  {result.suggestions.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs">Try:</span>
                      {result.suggestions.map((s) => (
                        <Button key={s} type="button" size="sm" variant="outline" onClick={() => applySuggestion(s)}>
                          {s}
                        </Button>
                      ))}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <FormField control={form.control} name="availability" render={() => <FormMessage className="mt-2" />} />
          </div>

          {check.kind === "done" && check.data.alternatives.length > 0 && (
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="mb-2 text-sm font-medium">Expanding abroad? The same name elsewhere:</p>
              <div className="flex flex-wrap gap-2">
                {check.data.alternatives.map((alt) => {
                  const j = getJurisdiction(alt.jurisdiction);
                  const ok = alt.result?.available;
                  return (
                    <Badge key={alt.jurisdiction} variant={ok ? "success" : "destructive"} className="py-1">
                      <span>{j.flag}</span> {j.shortName}: {alt.result?.query ?? "—"} — {alt.error ? "couldn't check" : ok ? "available" : "taken"}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground")}>
            {entity.jurisdiction === "AU" && <HelpTip topic="acn" jurisdiction="AU" />}
            {profile.country === "US" && <HelpTip topic="fileNumber" jurisdiction={entity.jurisdiction} />}
            {entity.jurisdiction === "UK" && <HelpTip topic="companyNumber" jurisdiction="UK" />}
          </div>
        </form>
      </Form>
    </StepShell>
  );
}
