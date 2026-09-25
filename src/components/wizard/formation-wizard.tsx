"use client";

import { Check, CloudCheck, Loader2 } from "lucide-react";
import { getEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import { calculateQuote } from "@/lib/pricing/quote";
import { cn, formatDate } from "@/lib/utils";
import { canVisit, completedSteps, parseSteps, selectedEntity, stepIndex, WIZARD_STEPS, type StepId } from "@/lib/wizard/machine";
import { useWizardDispatch, useWizardHydration, useWizardStore } from "@/lib/wizard/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PriceSummary } from "./price-summary";
import { AddOnsStep } from "./steps/addons-step";
import { CheckoutStep } from "./steps/checkout-step";
import { DetailsStep } from "./steps/details-step";
import { EntityStep } from "./steps/entity-step";
import { NameStep } from "./steps/name-step";
import { PeopleStep } from "./steps/people-step";
import { ReviewStep } from "./steps/review-step";

const STEP_COMPONENTS: Record<StepId, () => React.ReactNode> = {
  entity: EntityStep,
  name: NameStep,
  details: DetailsStep,
  people: PeopleStep,
  addons: AddOnsStep,
  review: ReviewStep,
  checkout: CheckoutStep,
};

export function FormationWizard() {
  const hydrated = useWizardHydration();
  if (!hydrated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Restoring your progress…
      </div>
    );
  }
  return (
    <TooltipProvider>
      <WizardLayout />
    </TooltipProvider>
  );
}

function WizardLayout() {
  const state = useWizardStore();
  const dispatch = useWizardDispatch();
  const done = completedSteps(state.draft);
  const current = stepIndex(state.currentStep);
  const StepComponent = STEP_COMPONENTS[state.currentStep];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            Step {current + 1} of {WIZARD_STEPS.length}: {WIZARD_STEPS[current]!.title}
          </span>
          {state.lastSavedAt && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CloudCheck className="size-3.5" /> Saved {formatDate(state.lastSavedAt, { timeStyle: "short" })}
            </span>
          )}
        </div>
        <Progress value={state.phase === "submitted" ? 100 : (current / (WIZARD_STEPS.length - 1)) * 100} />
        <nav aria-label="Formation steps">
          <ol className="hidden gap-1 md:flex">
            {WIZARD_STEPS.map((step, i) => {
              const enabled = canVisit(step.id, state);
              const active = step.id === state.currentStep;
              return (
                <li key={step.id} className="flex-1">
                  <button
                    type="button"
                    disabled={!enabled}
                    onClick={() => dispatch({ type: "GOTO", step: step.id })}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition",
                      active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted",
                      !enabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                        done.has(step.id) && "border-success bg-success text-white",
                        active && !done.has(step.id) && "border-primary text-primary",
                      )}
                    >
                      {done.has(step.id) ? <Check className="size-3" /> : i + 1}
                    </span>
                    {step.short}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <StepComponent key={state.currentStep} />
        <OrderSidebar />
      </div>
    </div>
  );
}

function OrderSidebar() {
  const draft = useWizardStore((s) => s.draft);
  const entity = selectedEntity(draft);
  if (!entity) {
    return (
      <Card className="hidden lg:flex">
        <CardContent className="text-sm text-muted-foreground">Choose a country to see transparent, itemised pricing.</CardContent>
      </Card>
    );
  }
  const profile = getJurisdiction(entity.jurisdiction);
  const entityProfile = getEntityProfile(entity.jurisdiction, entity.entityType);
  const name = parseSteps(draft, ["name"] as const)?.name;
  const quote = calculateQuote({
    jurisdiction: entity.jurisdiction,
    entityType: entity.entityType,
    addOns: draft.addons?.addOns ?? [],
    plan: draft.addons?.plan ?? "PAY_AS_YOU_GO",
    useAddressService: draft.details?.useAddressService ?? profile.address.registeredAgent === "required",
  });

  return (
    <Card className="gap-4 lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle className="text-base">
          {profile.flag} {name ? `${name.baseName} ${name.suffix}` : entityProfile.label}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {entityProfile.shortLabel} · {profile.registry.name}
        </p>
      </CardHeader>
      <CardContent>
        <PriceSummary quote={quote} compact />
      </CardContent>
    </Card>
  );
}
