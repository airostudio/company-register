import type { EntityType, Jurisdiction } from "@/lib/domain";
import { getEntityProfile, getJurisdiction, isEntityTypeAvailable } from "@/lib/jurisdictions";
import { jurisdictionIso } from "@/lib/countries";
import { isAddOnAvailable } from "@/lib/pricing/catalog";
import { emptyAddress } from "@/lib/validation/address";
import {
  createStepSchemas,
  entityStepSchema,
  type AddOnsStep,
  type DetailsStep,
  type EntityStep,
  type FormationApplication,
  type NameStep,
  type PeopleStep,
  type ReviewStep,
  type ValidationIssue,
} from "@/lib/validation/formation";

/**
 * Formation wizard state machine.
 *
 * Pure and framework-free: the Zustand store (./store.ts) just persists
 * WizardState and forwards events to `wizardReducer`. Guards reuse the same
 * Zod schemas the server uses, so "can I continue?" and "will the API accept
 * this?" can't drift apart.
 */

export const WIZARD_STEPS = [
  { id: "entity", title: "Country & entity", short: "Entity" },
  { id: "name", title: "Company name", short: "Name" },
  { id: "details", title: "Company details", short: "Details" },
  { id: "people", title: "People & ownership", short: "People" },
  { id: "addons", title: "Add-ons & plan", short: "Add-ons" },
  { id: "review", title: "Review & pricing", short: "Review" },
  { id: "checkout", title: "Checkout & lodgement", short: "Checkout" },
] as const;

export type StepId = (typeof WIZARD_STEPS)[number]["id"];
/** Steps that collect data (all but checkout). */
export type FormStepId = Exclude<StepId, "checkout">;
export const FORM_STEPS: readonly FormStepId[] = ["entity", "name", "details", "people", "addons", "review"];

export interface WizardDraft {
  entity?: Partial<EntityStep>;
  name?: Partial<NameStep>;
  details?: Partial<DetailsStep>;
  people?: Partial<PeopleStep>;
  addons?: Partial<AddOnsStep>;
  review?: Partial<ReviewStep>;
}

export type WizardPhase = "editing" | "submitting" | "submitted";

export interface WizardSubmission {
  companyId: string;
  filingId: string;
  submittedAt: string;
}

export interface WizardState {
  currentStep: StepId;
  draft: WizardDraft;
  phase: WizardPhase;
  submission?: WizardSubmission;
  submitError?: string;
}

export type WizardEvent =
  | { type: "SAVE_STEP"; step: FormStepId; values: WizardDraft[FormStepId] }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "GOTO"; step: StepId }
  | { type: "SUBMIT" }
  | { type: "SUBMIT_SUCCEEDED"; submission: WizardSubmission }
  | { type: "SUBMIT_FAILED"; error: string }
  | { type: "RESET" };

export const initialWizardState: WizardState = {
  currentStep: "entity",
  draft: {},
  phase: "editing",
};

export function stepIndex(step: StepId): number {
  return WIZARD_STEPS.findIndex((s) => s.id === step);
}

// ─── Guards ─────────────────────────────────────────────────────────────────

export interface StepValidation {
  valid: boolean;
  issues: ValidationIssue[];
}

export function selectedEntity(draft: WizardDraft): EntityStep | undefined {
  const parsed = entityStepSchema.safeParse(draft.entity);
  return parsed.success ? parsed.data : undefined;
}

export function validateStep(step: FormStepId, draft: WizardDraft): StepValidation {
  const entity = selectedEntity(draft);
  if (step === "entity") {
    const r = entityStepSchema.safeParse(draft.entity);
    return r.success ? { valid: true, issues: [] } : { valid: false, issues: toIssues(r.error.issues) };
  }
  if (!entity) {
    return { valid: false, issues: [{ path: "entity", message: "Choose a country and entity type first" }] };
  }
  const schema = createStepSchemas(entity.jurisdiction, entity.entityType)[step];
  const r = schema.safeParse(draft[step]);
  return r.success ? { valid: true, issues: [] } : { valid: false, issues: toIssues(r.error.issues) };
}

function toIssues(issues: { path: PropertyKey[]; message: string }[]): ValidationIssue[] {
  return issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

/** First data step that doesn't validate; "checkout" when everything is complete. */
export function firstIncompleteStep(draft: WizardDraft): StepId {
  return FORM_STEPS.find((s) => !validateStep(s, draft).valid) ?? "checkout";
}

export function completedSteps(draft: WizardDraft): Set<StepId> {
  const done = new Set<StepId>();
  for (const s of FORM_STEPS) {
    if (!validateStep(s, draft).valid) break;
    done.add(s);
  }
  return done;
}

export function canVisit(step: StepId, state: WizardState): boolean {
  if (state.phase !== "editing") return step === "checkout";
  return stepIndex(step) <= stepIndex(firstIncompleteStep(state.draft));
}

export function isReadyToSubmit(draft: WizardDraft): boolean {
  return firstIncompleteStep(draft) === "checkout";
}

/** The complete application, or undefined if any step is invalid. */
export function toApplication(draft: WizardDraft): FormationApplication | undefined {
  const entity = selectedEntity(draft);
  if (!entity) return undefined;
  const schemas = createStepSchemas(entity.jurisdiction, entity.entityType);
  const out: Record<string, unknown> = {};
  for (const step of FORM_STEPS) {
    const r = schemas[step].safeParse(draft[step]);
    if (!r.success) return undefined;
    out[step] = r.data;
  }
  return out as unknown as FormationApplication;
}

// ─── Defaults & reconciliation ──────────────────────────────────────────────

export function defaultNameStep(jurisdiction: Jurisdiction, entityType: EntityType): NameStep {
  return { baseName: "", suffix: getEntityProfile(jurisdiction, entityType).suffixes[0]!, availability: null };
}

export function defaultDetailsStep(jurisdiction: Jurisdiction): DetailsStep {
  const profile = getJurisdiction(jurisdiction);
  const iso = jurisdictionIso(jurisdiction);
  const address = emptyAddress(iso);
  if (profile.address.requiredRegion) address.region = profile.address.requiredRegion;
  return {
    // A registered agent is legally required in the US unless you have an in-state office.
    useAddressService: profile.address.registeredAgent === "required",
    registeredAddress: address,
    principalSameAsRegistered: profile.address.registeredAgent !== "required",
    principalAddress: emptyAddress(iso),
    businessActivity: "",
    sicCodes: [],
  };
}

export function defaultPeopleStep(jurisdiction: Jurisdiction, entityType: EntityType): PeopleStep {
  const entity = getEntityProfile(jurisdiction, entityType);
  return {
    officers: [],
    totalUnits: entity.ownership.defaultTotalUnits,
    shareholders: [],
    beneficialOwners: [],
    noBeneficialOwners: false,
  };
}

export function defaultAddOnsStep(jurisdiction: Jurisdiction): AddOnsStep {
  return { addOns: isAddOnAvailable("TAX_ID", jurisdiction) ? ["TAX_ID"] : [], plan: "PAY_AS_YOU_GO" };
}

export const defaultReviewStep: ReviewStep = {
  contactName: "",
  contactEmail: "",
  confirmAccuracy: false,
  acceptTerms: false,
};

/**
 * When the jurisdiction or entity type changes, keep everything that still
 * makes sense (names, people, addresses abroad) and reset what doesn't
 * (legal ending, name check, registered address, roles, share classes).
 */
export function reconcileDraftForEntity(draft: WizardDraft, previous: EntityStep | undefined, next: EntityStep): WizardDraft {
  if (previous && previous.jurisdiction === next.jurisdiction && previous.entityType === next.entityType) return draft;
  const entity = getEntityProfile(next.jurisdiction, next.entityType);
  const out: WizardDraft = { ...draft };

  if (draft.name) {
    out.name = { baseName: draft.name.baseName ?? "", suffix: entity.suffixes[0], availability: null };
  }

  if (draft.details && previous?.jurisdiction !== next.jurisdiction) {
    out.details = { ...defaultDetailsStep(next.jurisdiction), businessActivity: draft.details.businessActivity ?? "" };
  }

  if (draft.people) {
    const oldTotal = draft.people.totalUnits ?? 0;
    const newTotal = entity.ownership.defaultTotalUnits;
    const shareholders = (draft.people.shareholders ?? []).map((s) => ({
      ...s,
      shareClass: entity.ownership.defaultShareClass,
      pricePerUnit: entity.ownership.defaultPricePerUnit,
      units: oldTotal > 0 ? Math.round((s.units / oldTotal) * newTotal) : 0,
    }));
    // Give any rounding remainder to the largest holder so the total still reconciles.
    const allocated = shareholders.reduce((acc, s) => acc + s.units, 0);
    if (oldTotal > 0 && shareholders.length && allocated !== newTotal && allocated > 0) {
      const largest = shareholders.reduce((a, b) => (b.units > a.units ? b : a));
      largest.units += newTotal - allocated;
    }
    out.people = {
      ...draft.people,
      totalUnits: newTotal,
      officers: (draft.people.officers ?? []).map((o) => ({
        ...o,
        roles: o.roles.filter((r) => entity.allowedOfficerRoles.includes(r)),
      })),
      shareholders,
    };
  }

  if (draft.addons) {
    out.addons = {
      ...draft.addons,
      addOns: (draft.addons.addOns ?? []).filter((id) => isAddOnAvailable(id, next.jurisdiction)),
    };
  }
  return out;
}

// ─── Reducer ────────────────────────────────────────────────────────────────

export function wizardReducer(state: WizardState, event: WizardEvent): WizardState {
  switch (event.type) {
    case "SAVE_STEP": {
      if (state.phase !== "editing") return state;
      let draft: WizardDraft = { ...state.draft, [event.step]: event.values };
      if (event.step === "entity") {
        const previous = selectedEntity(state.draft);
        const next = selectedEntity(draft);
        if (next && isEntityTypeAvailable(next.jurisdiction, next.entityType)) {
          draft = reconcileDraftForEntity(draft, previous, next);
        }
      }
      return { ...state, draft, submitError: undefined };
    }
    case "NEXT": {
      if (state.phase !== "editing" || state.currentStep === "checkout") return state;
      if (!validateStep(state.currentStep, state.draft).valid) return state;
      const next = WIZARD_STEPS[stepIndex(state.currentStep) + 1];
      return next ? { ...state, currentStep: next.id } : state;
    }
    case "BACK": {
      if (state.phase !== "editing") return state;
      const prev = WIZARD_STEPS[stepIndex(state.currentStep) - 1];
      return prev ? { ...state, currentStep: prev.id } : state;
    }
    case "GOTO":
      return canVisit(event.step, state) ? { ...state, currentStep: event.step } : state;
    case "SUBMIT":
      if (state.phase !== "editing" || !isReadyToSubmit(state.draft)) return state;
      return { ...state, phase: "submitting", currentStep: "checkout", submitError: undefined };
    case "SUBMIT_SUCCEEDED":
      if (state.phase !== "submitting") return state;
      return { ...state, phase: "submitted", submission: event.submission, submitError: undefined };
    case "SUBMIT_FAILED":
      if (state.phase !== "submitting") return state;
      return { ...state, phase: "editing", submitError: event.error };
    case "RESET":
      return initialWizardState;
  }
}
