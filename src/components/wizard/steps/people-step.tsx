"use client";

import { useMemo } from "react";
import { useFieldArray, useForm, useFormContext, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Circle, Crown, ChartPie, Plus, Trash2, UserRound, Users } from "lucide-react";
import { jurisdictionIso } from "@/lib/countries";
import { ADDRESS_COUNTRIES } from "@/lib/countries";
import { OFFICER_ROLE_LABELS, SHARE_CLASS_LABELS, type EntityType, type Jurisdiction } from "@/lib/domain";
import { getEntityProfile, getJurisdiction } from "@/lib/jurisdictions";
import { cn, createId, formatPercent } from "@/lib/utils";
import { emptyAddress } from "@/lib/validation/address";
import {
  createPeopleStepSchema,
  summarizeOwnership,
  type BeneficialOwnerInput,
  type OfficerInput,
  type PeopleStep as PeopleValues,
  type ShareholderInput,
} from "@/lib/validation/formation";
import { defaultPeopleStep, selectedEntity } from "@/lib/wizard/machine";
import { useWizardDispatch, useWizardStore } from "@/lib/wizard/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddressFields } from "../address-fields";
import { HelpTip } from "../help-tip";
import { RootError, STEP_FORM_ID, StepShell } from "../step-shell";
import { useAutoSave } from "../use-auto-save";

interface Ctx {
  jurisdiction: Jurisdiction;
  entityType: EntityType;
}

function rootMessage(error: unknown): string | undefined {
  const e = error as { message?: string; root?: { message?: string } } | undefined;
  return e?.root?.message ?? e?.message;
}

function newOfficer(jurisdiction: Jurisdiction, roles: OfficerInput["roles"]): OfficerInput {
  return {
    id: createId("off"),
    fullName: "",
    email: "",
    roles,
    dateOfBirth: "",
    placeOfBirth: "",
    nationality: "",
    residentialAddress: emptyAddress(jurisdictionIso(jurisdiction)),
    directorId: "",
    consentToAct: false,
  };
}

export function PeopleStep() {
  const dispatch = useWizardDispatch();
  const draft = useWizardStore((s) => s.draft);
  const { jurisdiction, entityType } = selectedEntity(draft)!;
  const profile = getJurisdiction(jurisdiction);
  const entity = getEntityProfile(jurisdiction, entityType);
  const schema = useMemo(() => createPeopleStepSchema(jurisdiction, entityType), [jurisdiction, entityType]);

  const form = useForm<PeopleValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...defaultPeopleStep(jurisdiction, entityType), ...draft.people },
  });
  useAutoSave("people", form);
  const { errors } = form.formState;

  const officers = useWatch({ control: form.control, name: "officers" }) ?? [];
  const shareholders = useWatch({ control: form.control, name: "shareholders" }) ?? [];
  const beneficialOwners = useWatch({ control: form.control, name: "beneficialOwners" }) ?? [];
  const totalUnits = useWatch({ control: form.control, name: "totalUnits" });
  const summary = summarizeOwnership(shareholders, totalUnits);
  const isMembership = entity.ownership.kind === "membership";
  const bo = profile.people.beneficialOwnership;

  // Live requirements checklist (mirrors the Zod rules so users see progress before submitting).
  const residentIso = profile.people.residentDirectorCountry ? jurisdictionIso(jurisdiction) : undefined;
  const requirements = [
    ...entity.officerRequirements.map((r) => ({
      label: `${r.min}+ ${OFFICER_ROLE_LABELS[r.role]}`,
      met: officers.filter((o) => o.roles?.includes(r.role)).length >= r.min,
    })),
    ...(residentIso
      ? [{
          label: `A director living in ${profile.shortName}`,
          met: officers.some((o) => o.roles?.includes("DIRECTOR") && o.residentialAddress?.country === residentIso),
        }]
      : []),
    { label: isMembership ? "Membership interests total 100%" : "All shares allocated (100%)", met: summary.isComplete },
    ...(bo.required ? [{ label: `${bo.shortLabel} declared or statement made`, met: beneficialOwners.length > 0 || form.getValues("noBeneficialOwners") }] : []),
  ];

  const onSubmit = form.handleSubmit((values) => {
    dispatch({ type: "SAVE_STEP", step: "people", values });
    dispatch({ type: "NEXT" });
  });

  const tabError = (e: FieldErrors<PeopleValues>[keyof PeopleValues]) => (e ? <span className="size-1.5 rounded-full bg-destructive" /> : null);

  return (
    <StepShell
      title="People & ownership"
      description={`Who runs ${isMembership ? "and owns the LLC" : "the company and who holds its shares"}. Add each person once — you can copy details between tabs.`}
    >
      <Form {...form}>
        <form id={STEP_FORM_ID} className="space-y-6" onSubmit={onSubmit}>
          <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-[1fr_16rem]">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <ChartPie className="size-4" /> Ownership allocated
                </span>
                <span className={cn("tabular-nums", summary.isComplete ? "text-success" : "text-muted-foreground")}>
                  {isMembership
                    ? formatPercent(summary.percentAllocated)
                    : `${summary.allocated.toLocaleString()} / ${summary.totalUnits.toLocaleString()} ${entity.ownership.unitLabel.plural} · ${formatPercent(summary.percentAllocated)}`}
                </span>
              </div>
              <Progress
                value={Math.min(summary.percentAllocated, 100)}
                indicatorClassName={summary.percentAllocated > 100 ? "bg-destructive" : summary.isComplete ? "bg-success" : undefined}
              />
              {summary.percentAllocated > 100 && <p className="text-xs text-destructive">Over-allocated by {formatPercent(summary.percentAllocated - 100)}.</p>}
              {!summary.isComplete && summary.percentAllocated < 100 && summary.totalUnits > 0 && (
                <p className="text-xs text-muted-foreground">
                  {isMembership ? `${summary.remaining}% left to allocate.` : `${summary.remaining.toLocaleString()} ${entity.ownership.unitLabel.plural} left to allocate.`}
                </p>
              )}
            </div>
            <ul className="space-y-1 text-sm">
              {requirements.map((r) => (
                <li key={r.label} className={cn("flex items-center gap-2", r.met ? "text-foreground" : "text-muted-foreground")}>
                  {r.met ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4" />}
                  {r.label}
                </li>
              ))}
            </ul>
          </div>

          <Tabs defaultValue="officers">
            <TabsList>
              <TabsTrigger value="officers">
                <UserRound /> Officers <Badge variant="secondary">{officers.length}</Badge> {tabError(errors.officers)}
              </TabsTrigger>
              <TabsTrigger value="shareholders">
                <Users /> {isMembership ? "Members" : "Shareholders"} <Badge variant="secondary">{shareholders.length}</Badge>{" "}
                {tabError(errors.shareholders ?? errors.totalUnits)}
              </TabsTrigger>
              <TabsTrigger value="owners">
                <Crown /> {bo.label} <Badge variant="secondary">{beneficialOwners.length}</Badge> {tabError(errors.beneficialOwners ?? errors.noBeneficialOwners)}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="officers" forceMount className="data-[state=inactive]:hidden">
              <OfficersTab ctx={{ jurisdiction, entityType }} />
            </TabsContent>
            <TabsContent value="shareholders" forceMount className="data-[state=inactive]:hidden">
              <ShareholdersTab ctx={{ jurisdiction, entityType }} />
            </TabsContent>
            <TabsContent value="owners" forceMount className="data-[state=inactive]:hidden">
              <BeneficialOwnersTab ctx={{ jurisdiction, entityType }} />
            </TabsContent>
          </Tabs>
        </form>
      </Form>
    </StepShell>
  );
}

// ─── Officers ───────────────────────────────────────────────────────────────

function OfficersTab({ ctx }: { ctx: Ctx }) {
  const form = useFormContext<PeopleValues>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "officers", keyName: "fieldKey" });
  const entity = getEntityProfile(ctx.jurisdiction, ctx.entityType);
  const defaultRoles = fields.length === 0 ? entity.officerRequirements.map((r) => r.role) : [entity.officerRequirements[0]!.role];

  return (
    <div className="space-y-4">
      <RootError message={rootMessage(form.formState.errors.officers)} />
      {fields.map((field, index) => (
        <OfficerCard key={field.fieldKey} index={index} ctx={ctx} onRemove={() => remove(index)} />
      ))}
      <Button type="button" variant="outline" onClick={() => append(newOfficer(ctx.jurisdiction, defaultRoles))}>
        <Plus /> Add {fields.length === 0 ? "an officer" : "another officer"}
      </Button>
    </div>
  );
}

function OfficerCard({ index, ctx, onRemove }: { index: number; ctx: Ctx; onRemove: () => void }) {
  const form = useFormContext<PeopleValues>();
  const profile = getJurisdiction(ctx.jurisdiction);
  const entity = getEntityProfile(ctx.jurisdiction, ctx.entityType);
  const roles = useWatch({ control: form.control, name: `officers.${index}.roles` }) ?? [];
  const name = useWatch({ control: form.control, name: `officers.${index}.fullName` });
  const isDirector = roles.includes("DIRECTOR");
  const rules = profile.people;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">{name || `Officer ${index + 1}`}</h4>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove officer">
          <Trash2 /> Remove
        </Button>
      </div>

      <FormField
        control={form.control}
        name={`officers.${index}.roles`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Roles</FormLabel>
            <div className="flex flex-wrap gap-4">
              {entity.allowedOfficerRoles.map((role) => (
                <label key={role} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={field.value?.includes(role)}
                    onCheckedChange={(checked) =>
                      field.onChange(checked ? [...(field.value ?? []), role] : (field.value ?? []).filter((r) => r !== role))
                    }
                  />
                  {OFFICER_ROLE_LABELS[role]}
                </label>
              ))}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name={`officers.${index}.fullName`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full legal name</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`officers.${index}.email`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email (for e-signing consent)</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`officers.${index}.dateOfBirth`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date of birth{isDirector && rules.requiresDateOfBirth ? "" : " (optional)"}</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <NationalityField name={`officers.${index}.nationality`} />
        {isDirector && rules.requiresPlaceOfBirth && (
          <FormField
            control={form.control}
            name={`officers.${index}.placeOfBirth`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Place of birth (town, country)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Perth, Australia" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {isDirector && rules.requiresDirectorId && (
          <FormField
            control={form.control}
            name={`officers.${index}.directorId`}
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Director ID</FormLabel>
                  <HelpTip topic="directorId" jurisdiction={ctx.jurisdiction} />
                </div>
                <FormControl>
                  <Input inputMode="numeric" placeholder="15 digits" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {isDirector && ctx.jurisdiction === "UK" && (
          <FormField
            control={form.control}
            name={`officers.${index}.identityVerificationCode`}
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Companies House personal code (if you have it)</FormLabel>
                  <HelpTip topic="personalCode" jurisdiction="UK" />
                </div>
                <FormControl>
                  <Input autoComplete="off" placeholder="e.g. ABC12345DEF" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Residential address</span>
          {isDirector && rules.residentDirectorCountry && <HelpTip topic="residentDirector" jurisdiction={ctx.jurisdiction} />}
        </div>
        <AddressFields<PeopleValues> name={`officers.${index}.residentialAddress`} />
      </div>

      <FormField
        control={form.control}
        name={`officers.${index}.consentToAct`}
        render={({ field }) => (
          <FormItem className="flex items-start gap-2 space-y-0 rounded-md bg-muted/40 p-3">
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
            </FormControl>
            <div className="space-y-1">
              <FormLabel className="font-normal leading-snug">
                {name || "This person"} consents to act in these roles. We&apos;ll email a consent form to sign electronically.
              </FormLabel>
              <FormMessage />
            </div>
          </FormItem>
        )}
      />
    </div>
  );
}

function NationalityField({ name }: { name: `officers.${number}.nationality` | `beneficialOwners.${number}.nationality` }) {
  const form = useFormContext<PeopleValues>();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Nationality</FormLabel>
          <Select value={field.value || undefined} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {ADDRESS_COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// ─── Shareholders / members ─────────────────────────────────────────────────

function ShareholdersTab({ ctx }: { ctx: Ctx }) {
  const form = useFormContext<PeopleValues>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "shareholders", keyName: "fieldKey" });
  const entity = getEntityProfile(ctx.jurisdiction, ctx.entityType);
  const isMembership = entity.ownership.kind === "membership";
  const unit = entity.ownership.unitLabel;
  const totalUnits = useWatch({ control: form.control, name: "totalUnits" });

  const add = () => {
    const allocated = form.getValues("shareholders").reduce((acc, s) => acc + (Number.isFinite(s.units) ? s.units : 0), 0);
    const remaining = Math.max((totalUnits || 0) - allocated, 1);
    const holder: ShareholderInput = {
      id: createId("sh"),
      holderType: "INDIVIDUAL",
      fullName: "",
      email: "",
      address: emptyAddress(jurisdictionIso(ctx.jurisdiction)),
      shareClass: entity.ownership.defaultShareClass,
      units: remaining,
      pricePerUnit: entity.ownership.defaultPricePerUnit,
      beneficiallyHeld: true,
    };
    append(holder);
  };

  const splitEqually = () => {
    const count = fields.length;
    if (!count || !totalUnits) return;
    const each = Math.floor(totalUnits / count);
    fields.forEach((_, i) => {
      const units = i === 0 ? totalUnits - each * (count - 1) : each;
      form.setValue(`shareholders.${i}.units`, units, { shouldValidate: form.formState.isSubmitted });
    });
  };

  return (
    <div className="space-y-4">
      {!isMembership && (
        <div className="flex flex-wrap items-end gap-3">
          <FormField
            control={form.control}
            name="totalUnits"
            render={({ field }) => (
              <FormItem className="w-56">
                <div className="flex items-center justify-between">
                  <FormLabel>Total {unit.plural} to issue</FormLabel>
                  <HelpTip topic="shares" jurisdiction={ctx.jurisdiction} />
                </div>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    {...field}
                    value={Number.isFinite(field.value) ? field.value : ""}
                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}
      {isMembership && <HelpTip topic="membershipInterest" jurisdiction={ctx.jurisdiction} />}
      <RootError message={rootMessage(form.formState.errors.shareholders)} />

      {fields.map((field, index) => (
        <ShareholderCard key={field.fieldKey} index={index} ctx={ctx} onRemove={() => remove(index)} />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={add}>
          <Plus /> Add {isMembership ? "member" : "shareholder"}
        </Button>
        {fields.length > 1 && (
          <Button type="button" variant="ghost" onClick={splitEqually}>
            Split equally
          </Button>
        )}
      </div>
    </div>
  );
}

function ShareholderCard({ index, ctx, onRemove }: { index: number; ctx: Ctx; onRemove: () => void }) {
  const form = useFormContext<PeopleValues>();
  const entity = getEntityProfile(ctx.jurisdiction, ctx.entityType);
  const profile = getJurisdiction(ctx.jurisdiction);
  const isMembership = entity.ownership.kind === "membership";
  const officers = useWatch({ control: form.control, name: "officers" }) ?? [];
  const holder = useWatch({ control: form.control, name: `shareholders.${index}` });
  const totalUnits = useWatch({ control: form.control, name: "totalUnits" });
  const percent = totalUnits && Number.isFinite(holder?.units) ? (holder.units / totalUnits) * 100 : 0;

  const copyFromOfficer = (officerId: string) => {
    const officer = officers.find((o) => o.id === officerId);
    if (!officer) return;
    const opts = { shouldDirty: true, shouldValidate: form.formState.isSubmitted };
    form.setValue(`shareholders.${index}.holderType`, "INDIVIDUAL", opts);
    form.setValue(`shareholders.${index}.fullName`, officer.fullName, opts);
    form.setValue(`shareholders.${index}.email`, officer.email ?? "", opts);
    form.setValue(`shareholders.${index}.address`, structuredClone(officer.residentialAddress), opts);
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 font-medium">
          {holder?.fullName || `${isMembership ? "Member" : "Shareholder"} ${index + 1}`}
          <Badge variant={percent >= profile.people.beneficialOwnership.thresholdPercent ? "default" : "secondary"}>{formatPercent(Math.round(percent * 100) / 100)}</Badge>
        </h4>
        <div className="flex items-center gap-2">
          {officers.some((o) => o.fullName) && (
            <Select value="" onValueChange={copyFromOfficer}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Copy from officer…" />
              </SelectTrigger>
              <SelectContent>
                {officers
                  .filter((o) => o.fullName)
                  .map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.fullName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove shareholder">
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name={`shareholders.${index}.holderType`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Holder type</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="CORPORATE">Company / trust</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`shareholders.${index}.fullName`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{holder?.holderType === "CORPORATE" ? "Entity name" : "Full legal name"}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {entity.ownership.shareClasses.length > 1 && (
          <FormField
            control={form.control}
            name={`shareholders.${index}.shareClass`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Class</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {entity.ownership.shareClasses.map((c) => (
                      <SelectItem key={c} value={c}>
                        {SHARE_CLASS_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name={`shareholders.${index}.units`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{isMembership ? "Membership interest (%)" : `Number of ${entity.ownership.unitLabel.plural}`}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  {...field}
                  value={Number.isFinite(field.value) ? field.value : ""}
                  onChange={(e) => field.onChange(e.target.valueAsNumber)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {!isMembership && (
          <FormField
            control={form.control}
            name={`shareholders.${index}.pricePerUnit`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price paid per share ({profile.currency})</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    {...field}
                    value={Number.isFinite(field.value) ? field.value : ""}
                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>

      <AddressFields<PeopleValues> name={`shareholders.${index}.address`} label={holder?.holderType === "CORPORATE" ? "Registered address" : "Address"} />

      {ctx.jurisdiction === "AU" && (
        <FormField
          control={form.control}
          name={`shareholders.${index}.beneficiallyHeld`}
          render={({ field }) => (
            <FormItem className="flex items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              </FormControl>
              <FormLabel className="font-normal">Shares are held beneficially (not on trust for someone else)</FormLabel>
              <HelpTip topic="beneficialOwner" jurisdiction="AU" />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}

// ─── Beneficial owners / PSC ────────────────────────────────────────────────

function BeneficialOwnersTab({ ctx }: { ctx: Ctx }) {
  const form = useFormContext<PeopleValues>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "beneficialOwners", keyName: "fieldKey" });
  const profile = getJurisdiction(ctx.jurisdiction);
  const bo = profile.people.beneficialOwnership;
  const shareholders = useWatch({ control: form.control, name: "shareholders" }) ?? [];
  const officers = useWatch({ control: form.control, name: "officers" }) ?? [];
  const totalUnits = useWatch({ control: form.control, name: "totalUnits" });
  const noneStatement = useWatch({ control: form.control, name: "noBeneficialOwners" });
  const summary = summarizeOwnership(shareholders, totalUnits);

  const declared = new Set(form.getValues("beneficialOwners").map((b) => b.fullName.trim().toLowerCase()));
  const candidates = summary.holders.filter(
    (h) => h.holderType === "INDIVIDUAL" && h.percent >= bo.thresholdPercent && h.name && !declared.has(h.name.trim().toLowerCase()),
  );

  const importSignificant = () => {
    for (const h of candidates) {
      const holder = shareholders.find((s) => s.id === h.id)!;
      const officer = officers.find((o) => o.fullName.trim().toLowerCase() === h.name.trim().toLowerCase());
      const owner: BeneficialOwnerInput = {
        id: createId("bo"),
        fullName: h.name,
        dateOfBirth: officer?.dateOfBirth ?? "",
        nationality: officer?.nationality ?? "",
        residentialAddress: structuredClone(officer?.residentialAddress ?? holder.address),
        ownershipPercent: h.percent,
        natureOfControl: [defaultNatureOfControl(ctx.jurisdiction, h.percent)],
      };
      append(owner);
    }
    form.setValue("noBeneficialOwners", false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Individuals who own {bo.thresholdPercent}%+ or otherwise control the company.
        </p>
        <HelpTip topic={ctx.jurisdiction === "UK" ? "psc" : "beneficialOwner"} jurisdiction={ctx.jurisdiction} />
      </div>
      <RootError message={rootMessage(form.formState.errors.beneficialOwners)} />
      {candidates.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-accent/50 p-3 text-sm">
          <span>
            {candidates.map((c) => `${c.name} (${formatPercent(c.percent)})`).join(", ")} meet{candidates.length === 1 ? "s" : ""} the {bo.thresholdPercent}% test.
          </span>
          <Button type="button" size="sm" onClick={importSignificant}>
            Add from shareholders
          </Button>
        </div>
      )}

      {fields.map((field, index) => (
        <div key={field.fieldKey} className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">{form.getValues(`beneficialOwners.${index}.fullName`) || `${bo.shortLabel} ${index + 1}`}</h4>
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} aria-label="Remove">
              <Trash2 />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name={`beneficialOwners.${index}.fullName`}
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel>Full legal name</FormLabel>
                  <FormControl>
                    <Input {...f} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`beneficialOwners.${index}.ownershipPercent`}
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel>Ownership / voting %</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      {...f}
                      value={Number.isFinite(f.value) ? f.value : ""}
                      onChange={(e) => f.onChange(e.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`beneficialOwners.${index}.dateOfBirth`}
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel>Date of birth</FormLabel>
                  <FormControl>
                    <Input type="date" {...f} value={f.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <NationalityField name={`beneficialOwners.${index}.nationality`} />
            {ctx.jurisdiction === "UK" && (
              <FormField
                control={form.control}
                name={`beneficialOwners.${index}.identityVerificationCode`}
                render={({ field: f }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Companies House personal code (if you have it)</FormLabel>
                      <HelpTip topic="personalCode" jurisdiction="UK" />
                    </div>
                    <FormControl>
                      <Input autoComplete="off" {...f} value={f.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
          <FormField
            control={form.control}
            name={`beneficialOwners.${index}.natureOfControl`}
            render={({ field: f }) => (
              <FormItem>
                <FormLabel>Nature of control</FormLabel>
                <div className="grid gap-2 sm:grid-cols-2">
                  {bo.natureOfControlOptions.map((opt) => (
                    <label key={opt.value} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        className="mt-0.5"
                        checked={f.value?.includes(opt.value)}
                        onCheckedChange={(checked) =>
                          f.onChange(checked ? [...(f.value ?? []), opt.value] : (f.value ?? []).filter((v) => v !== opt.value))
                        }
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <AddressFields<PeopleValues> name={`beneficialOwners.${index}.residentialAddress`} label="Residential address" />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            append({
              id: createId("bo"),
              fullName: "",
              dateOfBirth: "",
              nationality: "",
              residentialAddress: emptyAddress(jurisdictionIso(ctx.jurisdiction)),
              ownershipPercent: 0,
              natureOfControl: [],
            })
          }
        >
          <Plus /> Add {bo.shortLabel}
        </Button>
        {fields.length === 0 && (
          <FormField
            control={form.control}
            name="noBeneficialOwners"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <Checkbox checked={noneStatement} onCheckedChange={(v) => field.onChange(v === true)} />
                </FormControl>
                <FormLabel className="font-normal">Nobody meets the {bo.thresholdPercent}% test or otherwise controls the company</FormLabel>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>
    </div>
  );
}

/** Best-fit nature-of-control statement for a direct shareholding (UK uses PSC share bands). */
function defaultNatureOfControl(jurisdiction: Jurisdiction, percent: number): string {
  if (jurisdiction === "UK") {
    if (percent >= 75) return "OWNERSHIP_OF_SHARES_75_TO_100";
    if (percent > 50) return "OWNERSHIP_OF_SHARES_50_TO_75";
    if (percent > 25) return "OWNERSHIP_OF_SHARES_25_TO_50";
    return "SIGNIFICANT_INFLUENCE_OR_CONTROL";
  }
  const options = getJurisdiction(jurisdiction).people.beneficialOwnership.natureOfControlOptions;
  return (options.find((o) => /OWNERSHIP|VOTING/.test(o.value)) ?? options[0]!).value;
}
