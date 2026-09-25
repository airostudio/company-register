"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Clock } from "lucide-react";
import type { EntityType, Jurisdiction } from "@/lib/domain";
import { getJurisdiction, listJurisdictions } from "@/lib/jurisdictions";
import { cn, formatMoney } from "@/lib/utils";
import { entityStepSchema, type EntityStep as EntityValues } from "@/lib/validation/formation";
import { useWizardDispatch, useWizardStore } from "@/lib/wizard/store";
import { Badge } from "@/components/ui/badge";
import { Form, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { HelpTip } from "../help-tip";
import { STEP_FORM_ID, StepShell } from "../step-shell";
import { useAutoSave } from "../use-auto-save";

export function EntityStep() {
  const dispatch = useWizardDispatch();
  const saved = useWizardStore((s) => s.draft.entity);
  const form = useForm<EntityValues>({
    resolver: zodResolver(entityStepSchema),
    defaultValues: { jurisdiction: saved?.jurisdiction, entityType: saved?.entityType },
  });
  useAutoSave("entity", form);
  const jurisdiction = useWatch({ control: form.control, name: "jurisdiction" }) as Jurisdiction | undefined;
  const profile = jurisdiction ? getJurisdiction(jurisdiction) : undefined;

  const selectJurisdiction = (code: Jurisdiction) => {
    form.setValue("jurisdiction", code, { shouldValidate: form.formState.isSubmitted });
    const current = form.getValues("entityType");
    const available = getJurisdiction(code).entityTypes;
    if (!available.some((e) => e.type === current)) {
      form.setValue("entityType", (available.find((e) => e.popular) ?? available[0]!).type, { shouldValidate: form.formState.isSubmitted });
    }
  };

  return (
    <StepShell title="Where are you registering?" description="Choose the country (or US state) and the type of company. You can change this later — we'll keep the rest of your answers.">
      <Form {...form}>
        <form
          id={STEP_FORM_ID}
          className="space-y-8"
          onSubmit={form.handleSubmit((values) => {
            dispatch({ type: "SAVE_STEP", step: "entity", values });
            dispatch({ type: "NEXT" });
          })}
        >
          <FormField
            control={form.control}
            name="jurisdiction"
            render={({ field }) => (
              <FormItem>
                <div role="radiogroup" aria-label="Jurisdiction" className="grid gap-3 sm:grid-cols-2">
                  {listJurisdictions().map((j) => {
                    const selected = field.value === j.code;
                    return (
                      <button
                        key={j.code}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => selectJurisdiction(j.code)}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border bg-card p-4 text-left transition hover:border-primary/60",
                          selected && "border-primary ring-2 ring-primary/20",
                        )}
                      >
                        <span className="text-2xl leading-none">{j.flag}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{j.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {j.registry.name} · {j.entityTypes.map((e) => e.shortLabel).join(", ")}
                          </span>
                        </span>
                        {selected && <Check className="size-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {profile && (
            <FormField
              control={form.control}
              name="entityType"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Entity type</h3>
                    {profile.country === "US" && <HelpTip topic="llcVsCorp" jurisdiction={profile.code} />}
                  </div>
                  <div role="radiogroup" aria-label="Entity type" className="grid gap-3">
                    {profile.entityTypes.map((e) => {
                      const selected = field.value === e.type;
                      return (
                        <button
                          key={e.type}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => field.onChange(e.type as EntityType)}
                          className={cn(
                            "flex items-start gap-4 rounded-lg border bg-card p-4 text-left transition hover:border-primary/60",
                            selected && "border-primary ring-2 ring-primary/20",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                              selected && "border-primary bg-primary text-primary-foreground",
                            )}
                          >
                            {selected && <Check className="size-3" />}
                          </span>
                          <span className="flex-1 space-y-1">
                            <span className="flex flex-wrap items-center gap-2 font-medium">
                              {e.label}
                              {e.popular && <Badge variant="secondary">Popular</Badge>}
                            </span>
                            <span className="block text-sm text-muted-foreground">{e.description}</span>
                            <span className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                              <span>
                                Government fee: <strong className="text-foreground">{formatMoney(e.governmentFee, profile.currency)}</strong>
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="size-3" /> {e.processingTime.standard}
                                {e.processingTime.expedited && ` · ${e.processingTime.expedited} expedited`}
                              </span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </form>
      </Form>
    </StepShell>
  );
}
