import { describe, expect, it } from "vitest";
import { buildApplication } from "@/test/fixtures";
import {
  canVisit,
  firstIncompleteStep,
  initialWizardState,
  toApplication,
  wizardReducer,
  type WizardDraft,
  type WizardState,
} from "./machine";

function stateWith(draft: WizardDraft, patch: Partial<WizardState> = {}): WizardState {
  return { ...initialWizardState, draft, ...patch };
}

describe("wizard guards", () => {
  it("blocks NEXT until the current step is valid", () => {
    let s = wizardReducer(initialWizardState, { type: "NEXT" });
    expect(s.currentStep).toBe("entity");
    s = wizardReducer(s, { type: "SAVE_STEP", step: "entity", values: { jurisdiction: "AU", entityType: "AU_PTY_LTD" } });
    s = wizardReducer(s, { type: "NEXT" });
    expect(s.currentStep).toBe("name");
  });

  it("only allows jumping to steps up to the first incomplete one", () => {
    const app = buildApplication("UK", "UK_LTD");
    const s = stateWith({ entity: app.entity, name: app.name });
    expect(firstIncompleteStep(s.draft)).toBe("details");
    expect(canVisit("details", s)).toBe(true);
    expect(canVisit("people", s)).toBe(false);
    expect(wizardReducer(s, { type: "GOTO", step: "review" }).currentStep).toBe("entity");
  });

  it("produces a full application once every step validates", () => {
    const app = buildApplication("US_DE", "US_C_CORP");
    expect(firstIncompleteStep(app)).toBe("checkout");
    expect(toApplication(app)?.name.baseName).toBe("Harbourview Robotics");
  });
});

describe("entity change reconciliation", () => {
  it("resets the suffix and name check, filters roles and rescales ownership", () => {
    const app = buildApplication("AU", "AU_PTY_LTD");
    app.people.shareholders[0]!.units = 75;
    app.people.shareholders[1]!.units = 25;
    let s = stateWith(app);
    s = wizardReducer(s, { type: "SAVE_STEP", step: "entity", values: { jurisdiction: "US_DE", entityType: "US_C_CORP" } });

    expect(s.draft.name).toMatchObject({ baseName: "Harbourview Robotics", suffix: "Inc.", availability: null });
    expect(s.draft.details?.useAddressService).toBe(true);
    expect(s.draft.details?.businessActivity).toBe(app.details.businessActivity);
    expect(s.draft.people?.officers?.[0]?.roles).toEqual(["DIRECTOR"]);
    expect(s.draft.people?.totalUnits).toBe(10_000_000);
    expect(s.draft.people?.shareholders?.map((h) => [h.units, h.shareClass])).toEqual([
      [7_500_000, "COMMON"],
      [2_500_000, "COMMON"],
    ]);
    expect(firstIncompleteStep(s.draft)).toBe("name");
  });

  it("keeps rescaled ownership summing to the new total despite rounding", () => {
    const app = buildApplication("AU", "AU_PTY_LTD");
    app.people.totalUnits = 3;
    app.people.shareholders[0]!.units = 1;
    app.people.shareholders[1]!.units = 2;
    const s = wizardReducer(stateWith(app), { type: "SAVE_STEP", step: "entity", values: { jurisdiction: "US_WY", entityType: "US_LLC" } });
    const units = s.draft.people!.shareholders!.map((h) => h.units);
    expect(units.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("submission", () => {
  it("runs editing → submitting → submitted and locks editing", () => {
    const app = buildApplication("AU", "AU_PTY_LTD");
    let s = wizardReducer(stateWith(app, { currentStep: "review" }), { type: "SUBMIT" });
    expect(s).toMatchObject({ phase: "submitting", currentStep: "checkout" });
    s = wizardReducer(s, { type: "SUBMIT_SUCCEEDED", submission: { companyId: "c", filingId: "f", submittedAt: "now" } });
    expect(s.phase).toBe("submitted");
    expect(wizardReducer(s, { type: "SAVE_STEP", step: "name", values: {} })).toBe(s);
    expect(wizardReducer(s, { type: "GOTO", step: "entity" }).currentStep).toBe("checkout");
  });

  it("returns to editing with an error when submission fails", () => {
    const app = buildApplication("AU", "AU_PTY_LTD");
    let s = wizardReducer(stateWith(app), { type: "SUBMIT" });
    s = wizardReducer(s, { type: "SUBMIT_FAILED", error: "Registry offline" });
    expect(s).toMatchObject({ phase: "editing", submitError: "Registry offline" });
  });

  it("refuses to submit an incomplete draft", () => {
    const s = wizardReducer(stateWith({ entity: { jurisdiction: "AU", entityType: "AU_PTY_LTD" } }), { type: "SUBMIT" });
    expect(s.phase).toBe("editing");
  });
});
