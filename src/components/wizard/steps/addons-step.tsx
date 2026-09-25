"use client";

import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote, Check, FileSearch, Earth, MapPin, Receipt, Zap } from "lucide-react";
import { jurisdictionIso } from "@/lib/countries";
import { SUBSCRIPTION_PLANS } from "@/lib/domain";
import { getEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import { ADD_ONS, PLANS, addOnsFor, localize, type AddOnDefinition } from "@/lib/pricing/catalog";
import { cn, formatMoney } from "@/lib/utils";
import { createAddOnsStepSchema, type AddOnsStep as AddOnsValues } from "@/lib/validation/formation";
import { defaultAddOnsStep, selectedEntity } from "@/lib/wizard/machine";
import { useWizardDispatch, useWizardStore } from "@/lib/wizard/store";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormField } from "@/components/ui/form";
import { HelpTip } from "../help-tip";
import { STEP_FORM_ID, StepShell } from "../step-shell";
import { useAutoSave } from "../use-auto-save";

const ICONS: Record<AddOnDefinition["category"], typeof Zap> = {
  tax: Receipt,
  speed: Zap,
  address: MapPin,
  compliance: FileSearch,
  banking: Banknote,
  international: Earth,
};

export function AddOnsStep() {
  const dispatch = useWizardDispatch();
  const draft = useWizardStore((s) => s.draft);
  const { jurisdiction, entityType } = selectedEntity(draft)!;
  const profile = getJurisdiction(jurisdiction);
  const entity = getEntityProfile(jurisdiction, entityType);
  const schema = useMemo(() => createAddOnsStepSchema(jurisdiction), [jurisdiction]);
  const form = useForm<AddOnsValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...defaultAddOnsStep(jurisdiction), ...draft.addons },
  });
  useAutoSave("addons", form);
  const plan = useWatch({ control: form.control, name: "plan" });

  // Suggest the non-resident package when founders live outside the US.
  const homeIso = jurisdictionIso(jurisdiction);
  const hasForeignFounder = (draft.people?.officers ?? []).some((o) => o.residentialAddress?.country && o.residentialAddress.country !== homeIso);
  const toggleable = addOnsFor(jurisdiction).filter((a) => a.managedBy !== "address-service");
  const addressService = draft.details?.useAddressService
    ? ADD_ONS[profile.address.registeredAgent === "required" ? "REGISTERED_AGENT" : "VIRTUAL_OFFICE"]
    : undefined;

  return (
    <StepShell title="Add-ons & compliance plan" description="Everything you need after incorporation. Pay only for what you pick.">
      <Form {...form}>
        <form
          id={STEP_FORM_ID}
          className="space-y-8"
          onSubmit={form.handleSubmit((values) => {
            dispatch({ type: "SAVE_STEP", step: "addons", values });
            dispatch({ type: "NEXT" });
          })}
        >
          <section className="space-y-3">
            <h3 className="font-medium">Post-formation services</h3>
            <FormField
              control={form.control}
              name="addOns"
              render={({ field }) => (
                <div className="grid gap-3">
                  {toggleable.map((addOn) => {
                    const Icon = ICONS[addOn.category];
                    const checked = field.value?.includes(addOn.id) ?? false;
                    const included = PLANS[plan]?.includes.includes(addOn.id);
                    const recommended = addOn.recommended || (addOn.id === "FOREIGN_FOUNDER" && hasForeignFounder);
                    const expediteNote =
                      addOn.id === "EXPEDITED" && entity.governmentExpediteFee
                        ? ` Includes ${profile.registry.code} priority fee of ${formatMoney(entity.governmentExpediteFee, profile.currency)} (${entity.processingTime.expedited}).`
                        : "";
                    return (
                      <label
                        key={addOn.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-4 transition hover:border-primary/60",
                          (checked || included) && "border-primary/70 bg-accent/30",
                        )}
                      >
                        <Checkbox
                          className="mt-1"
                          checked={checked || included}
                          disabled={included}
                          onCheckedChange={(v) =>
                            field.onChange(v ? [...(field.value ?? []), addOn.id] : (field.value ?? []).filter((id) => id !== addOn.id))
                          }
                        />
                        <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                        <span className="flex-1 space-y-1">
                          <span className="flex flex-wrap items-center gap-2 font-medium">
                            {localize(addOn.name, profile.country)}
                            {recommended && <Badge variant="secondary">Recommended</Badge>}
                            {addOn.id === "TAX_ID" && profile.country === "US" && <HelpTip topic="ein" jurisdiction={jurisdiction} />}
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            {localize(addOn.description, profile.country)}
                            {expediteNote}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-medium tabular-nums">
                          {included
                            ? "Included"
                            : addOn.price[profile.currency] === 0
                              ? "Free"
                              : `${formatMoney(addOn.price[profile.currency], profile.currency)}${addOn.recurring ? "/yr" : ""}`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            />
            {addressService && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="size-4 text-success" /> {localize(addressService.name, profile.country)} — selected in Company details.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-medium">Ongoing compliance</h3>
            <FormField
              control={form.control}
              name="plan"
              render={({ field }) => (
                <div role="radiogroup" className="grid gap-3 md:grid-cols-3">
                  {SUBSCRIPTION_PLANS.map((id) => {
                    const p = PLANS[id];
                    const active = field.value === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => field.onChange(id)}
                        className={cn(
                          "flex flex-col gap-2 rounded-lg border bg-card p-4 text-left transition hover:border-primary/60",
                          active && "border-primary ring-2 ring-primary/20",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium">{p.name}</span>
                          {p.recommended && <Badge>Best value</Badge>}
                        </span>
                        <span className="text-2xl font-semibold tabular-nums">
                          {p.price[profile.currency] ? formatMoney(p.price[profile.currency], profile.currency) : "Free"}
                          {p.price[profile.currency] > 0 && <span className="text-sm font-normal text-muted-foreground">/yr</span>}
                        </span>
                        <span className="text-sm text-muted-foreground">{p.tagline}</span>
                        <ul className="space-y-1 pt-1 text-xs">
                          {p.features.map((f) => (
                            <li key={f} className="flex gap-1.5">
                              <Check className="mt-0.5 size-3 shrink-0 text-success" /> {f}
                            </li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </section>
        </form>
      </Form>
    </StepShell>
  );
}
