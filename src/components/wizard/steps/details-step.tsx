"use client";

import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building, Check, MapPin, X } from "lucide-react";
import { getJurisdiction, SIC_CODES } from "@/lib/jurisdictions";
import { ADDRESS_SERVICE_PROVIDERS } from "@/lib/jurisdictions/service-providers";
import { ADD_ONS, localize } from "@/lib/pricing/catalog";
import { cn, formatMoney } from "@/lib/utils";
import { formatAddress } from "@/lib/validation/address";
import { createDetailsStepSchema, type DetailsStep as DetailsValues } from "@/lib/validation/formation";
import { defaultDetailsStep, selectedEntity } from "@/lib/wizard/machine";
import { useWizardDispatch, useWizardStore } from "@/lib/wizard/store";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AddressFields } from "../address-fields";
import { HelpTip } from "../help-tip";
import { STEP_FORM_ID, StepShell } from "../step-shell";
import { useAutoSave } from "../use-auto-save";

export function DetailsStep() {
  const dispatch = useWizardDispatch();
  const draft = useWizardStore((s) => s.draft);
  const { jurisdiction } = selectedEntity(draft)!;
  const profile = getJurisdiction(jurisdiction);
  const provider = ADDRESS_SERVICE_PROVIDERS[jurisdiction];
  const schema = useMemo(() => createDetailsStepSchema(jurisdiction), [jurisdiction]);
  const defaults = defaultDetailsStep(jurisdiction);

  const form = useForm<DetailsValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...defaults,
      ...draft.details,
      registeredAddress: draft.details?.registeredAddress ?? defaults.registeredAddress,
      principalAddress: draft.details?.principalAddress ?? defaults.principalAddress,
    },
  });
  useAutoSave("details", form);

  const useService = useWatch({ control: form.control, name: "useAddressService" });
  const sameAsRegistered = useWatch({ control: form.control, name: "principalSameAsRegistered" });
  const sicCodes = useWatch({ control: form.control, name: "sicCodes" }) ?? [];

  const agentRequired = profile.address.registeredAgent === "required";
  const serviceAddOn = ADD_ONS[agentRequired ? "REGISTERED_AGENT" : "VIRTUAL_OFFICE"];
  const serviceLabel = agentRequired ? "Use our registered agent" : "Use our registered office address";
  const needsPrincipal = profile.address.hasPrincipalPlaceOfBusiness && (useService || !sameAsRegistered);

  return (
    <StepShell
      title="Company details"
      description="Where the company can be served legal documents, and what it will do."
    >
      <Form {...form}>
        <form
          id={STEP_FORM_ID}
          className="space-y-8"
          onSubmit={form.handleSubmit((values) => {
            dispatch({ type: "SAVE_STEP", step: "details", values });
            dispatch({ type: "NEXT" });
          })}
        >
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">{agentRequired ? "Registered agent & office" : "Registered office"}</h3>
              <HelpTip topic={agentRequired ? "registeredAgent" : "physicalAddress"} jurisdiction={jurisdiction} />
            </div>
            <FormField
              control={form.control}
              name="useAddressService"
              render={({ field }) => (
                <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      value: true,
                      icon: Building,
                      title: serviceLabel,
                      body: `${provider.name}, ${formatAddress(provider.address)}`,
                      price: `${formatMoney(serviceAddOn.price[profile.currency], profile.currency)}/yr`,
                    },
                    {
                      value: false,
                      icon: MapPin,
                      title: agentRequired ? `I have a ${profile.shortName} address` : "Use my own address",
                      body: agentRequired
                        ? `You'll act as your own registered agent at a physical address in ${profile.shortName}.`
                        : "A physical street address where someone can accept documents during business hours.",
                      price: "Free",
                    },
                  ].map((option) => {
                    const selected = field.value === option.value;
                    return (
                      <button
                        key={String(option.value)}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => field.onChange(option.value)}
                        className={cn(
                          "flex gap-3 rounded-lg border bg-card p-4 text-left transition hover:border-primary/60",
                          selected && "border-primary ring-2 ring-primary/20",
                        )}
                      >
                        <option.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                        <span className="space-y-1">
                          <span className="flex flex-wrap items-center gap-2 font-medium">
                            {option.title}
                            <Badge variant={option.value ? "secondary" : "outline"}>{option.price}</Badge>
                          </span>
                          <span className="block text-sm text-muted-foreground">{option.body}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            />
            {!useService && (
              <div className="rounded-lg border p-4">
                <AddressFields<DetailsValues>
                  name="registeredAddress"
                  lockCountry
                  lockRegion={Boolean(profile.address.requiredRegion)}
                />
              </div>
            )}
          </section>

          {profile.address.hasPrincipalPlaceOfBusiness && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">Principal place of business</h3>
                {jurisdiction === "AU" && <HelpTip topic="principalPlace" jurisdiction="AU" />}
                {profile.country === "US" && <HelpTip topic="nonResident" jurisdiction={jurisdiction} />}
              </div>
              {!useService && (
                <FormField
                  control={form.control}
                  name="principalSameAsRegistered"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                      </FormControl>
                      <FormLabel className="font-normal">Same as the registered office</FormLabel>
                    </FormItem>
                  )}
                />
              )}
              {needsPrincipal && (
                <div className="rounded-lg border p-4">
                  <AddressFields<DetailsValues> name="principalAddress" lockCountry={jurisdiction === "AU"} />
                  {profile.country === "US" && (
                    <p className="mt-3 text-xs text-muted-foreground">Your principal office can be anywhere in the world.</p>
                  )}
                </div>
              )}
            </section>
          )}

          <FormField
            control={form.control}
            name="businessActivity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>What will the company do?</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="e.g. Develop and sell software for warehouse automation" {...field} />
                </FormControl>
                <FormDescription>Used in your governing documents and for tax registrations.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {profile.requiresSicCodes && (
            <FormField
              control={form.control}
              name="sicCodes"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>SIC codes (1–4)</FormLabel>
                    <HelpTip topic="sic" jurisdiction="UK" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sicCodes.map((code) => (
                      <Badge key={code} variant="secondary" className="py-1">
                        {code} — {SIC_CODES.find((s) => s.code === code)?.label}
                        <button
                          type="button"
                          aria-label={`Remove ${code}`}
                          onClick={() => field.onChange(sicCodes.filter((c) => c !== code))}
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  {sicCodes.length < 4 && (
                    <Select value="" onValueChange={(code) => field.onChange([...sicCodes, code])}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Add a SIC code" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SIC_CODES.filter((s) => !sicCodes.includes(s.code)).map((s) => (
                          <SelectItem key={s.code} value={s.code}>
                            {s.code} — {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {jurisdiction === "UK" && (
            <section className="space-y-3">
              <FormField
                control={form.control}
                name="registeredEmail"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Registered email address</FormLabel>
                      <HelpTip topic="registeredEmail" jurisdiction="UK" />
                    </div>
                    <FormControl>
                      <Input type="email" autoComplete="email" placeholder="company@yourdomain.com" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormDescription>Not shown on the public register.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lawfulPurposeConfirmed"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-2 space-y-0">
                    <FormControl>
                      <Checkbox className="mt-0.5" checked={field.value === true} onCheckedChange={(v) => field.onChange(v === true)} />
                    </FormControl>
                    <div className="space-y-1">
                      <FormLabel className="leading-snug font-normal">
                        The company is being formed for a lawful purpose, and its intended future activities are lawful.
                      </FormLabel>
                      <HelpTip topic="lawfulPurpose" jurisdiction="UK" />
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />
            </section>
          )}

          {useService && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="size-4 text-success" />
              {localize(serviceAddOn.name, profile.country)} will be added to your order.
            </p>
          )}
        </form>
      </Form>
    </StepShell>
  );
}
