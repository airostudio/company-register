"use client";

import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { countryName } from "@/lib/countries";
import { OFFICER_ROLE_LABELS, SHARE_CLASS_LABELS } from "@/lib/domain";
import { composeCompanyName, getEntityProfile, getJurisdiction, SIC_CODES } from "@/lib/jurisdictions";
import { ADDRESS_SERVICE_PROVIDERS } from "@/lib/jurisdictions/service-providers";
import { calculateQuote } from "@/lib/pricing/quote";
import { formatPercent } from "@/lib/utils";
import { formatAddress } from "@/lib/validation/address";
import { reviewStepSchema, summarizeOwnership, type ReviewStep as ReviewValues } from "@/lib/validation/formation";
import { defaultReviewStep, parseSteps, type StepId } from "@/lib/wizard/machine";
import { useWizardDispatch, useWizardStore } from "@/lib/wizard/store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PriceSummary } from "../price-summary";
import { STEP_FORM_ID, StepShell } from "../step-shell";
import { useAutoSave } from "../use-auto-save";

function Section({ title, step, children }: { title: string; step: StepId; children: ReactNode }) {
  const dispatch = useWizardDispatch();
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => dispatch({ type: "GOTO", step })}>
          <Pencil /> Edit
        </Button>
      </div>
      <div className="text-sm">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function ReviewStep() {
  const dispatch = useWizardDispatch();
  const draft = useWizardStore((s) => s.draft);
  const form = useForm<ReviewValues>({
    resolver: zodResolver(reviewStepSchema),
    defaultValues: { ...defaultReviewStep, ...draft.review },
  });
  useAutoSave("review", form);

  // Every earlier step is valid here (the machine guards navigation).
  const app = parseSteps(draft, ["entity", "name", "details", "people", "addons"] as const);
  if (!app) return null;
  const { jurisdiction, entityType } = app.entity;
  const profile = getJurisdiction(jurisdiction);
  const entity = getEntityProfile(jurisdiction, entityType);
  const quote = calculateQuote({
    jurisdiction,
    entityType,
    addOns: app.addons.addOns,
    plan: app.addons.plan,
    useAddressService: app.details.useAddressService,
  });
  const ownership = summarizeOwnership(app.people.shareholders, app.people.totalUnits);
  const registered = app.details.useAddressService ? ADDRESS_SERVICE_PROVIDERS[jurisdiction].address : app.details.registeredAddress;

  return (
    <StepShell title="Review & confirm" description="Check everything before we lodge with the registry." nextLabel="Proceed to checkout">
      <div className="space-y-5">
        <Section title="Company" step="name">
          <Row label="Name">{composeCompanyName(app.name.baseName, app.name.suffix)}</Row>
          <Row label="Type">
            {profile.flag} {entity.label}, {profile.name}
          </Row>
          <Row label="Registry">{profile.registry.name}</Row>
        </Section>
        <Separator />
        <Section title="Addresses & activity" step="details">
          <Row label={app.details.useAddressService && profile.address.registeredAgent === "required" ? "Registered agent" : "Registered office"}>
            {app.details.useAddressService && `${ADDRESS_SERVICE_PROVIDERS[jurisdiction].name}, `}
            {formatAddress(registered)}
          </Row>
          {profile.address.hasPrincipalPlaceOfBusiness && (
            <Row label="Principal place">
              {app.details.useAddressService || !app.details.principalSameAsRegistered ? formatAddress(app.details.principalAddress) : "Same as registered office"}
            </Row>
          )}
          <Row label="Activity">{app.details.businessActivity}</Row>
          {app.details.sicCodes.length > 0 && (
            <Row label="SIC codes">{app.details.sicCodes.map((c) => `${c} ${SIC_CODES.find((s) => s.code === c)?.label ?? ""}`).join("; ")}</Row>
          )}
        </Section>
        <Separator />
        <Section title="People & ownership" step="people">
          {app.people.officers.map((o) => (
            <Row key={o.id} label={o.roles.map((r) => OFFICER_ROLE_LABELS[r]).join(", ")}>
              {o.fullName} · {countryName(o.residentialAddress.country)}
            </Row>
          ))}
          {app.people.shareholders.map((s, i) => (
            <Row key={s.id} label={entity.ownership.kind === "membership" ? "Member" : "Shareholder"}>
              {s.fullName} —{" "}
              {entity.ownership.kind === "membership"
                ? `${s.units}%`
                : `${s.units.toLocaleString()} ${SHARE_CLASS_LABELS[s.shareClass].toLowerCase()} (${formatPercent(ownership.holders[i]!.percent)})`}
            </Row>
          ))}
          <Row label={profile.people.beneficialOwnership.shortLabel}>
            {app.people.beneficialOwners.map((b) => `${b.fullName} (${formatPercent(b.ownershipPercent)})`).join(", ") ||
              (app.people.noBeneficialOwners ? "Statement: none" : "None declared")}
          </Row>
        </Section>
        <Separator />
        <Section title="Price breakdown" step="addons">
          <div className="rounded-lg border bg-muted/30 p-4">
            <PriceSummary quote={quote} />
          </div>
        </Section>
        <Separator />

        <Form {...form}>
          <form
            id={STEP_FORM_ID}
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => {
              dispatch({ type: "SAVE_STEP", step: "review", values });
              dispatch({ type: "NEXT" });
            })}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="contactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your name</FormLabel>
                    <FormControl>
                      <Input autoComplete="name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email for updates & documents</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {(
              [
                ["confirmAccuracy", "I confirm these details are correct and that every officer has agreed to act."],
                ["acceptTerms", `I authorise GlobalCorp Hub to lodge this application with ${profile.registry.name} on my behalf and accept the terms of service.`],
              ] as const
            ).map(([name, label]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem className="flex items-start gap-2 space-y-0">
                    <FormControl>
                      <Checkbox className="mt-0.5" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                    </FormControl>
                    <div className="space-y-1">
                      <FormLabel className="leading-snug font-normal">{label}</FormLabel>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />
            ))}
          </form>
        </Form>
      </div>
    </StepShell>
  );
}
