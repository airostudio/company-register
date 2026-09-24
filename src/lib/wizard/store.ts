"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { initialWizardState, wizardReducer, type WizardEvent, type WizardState } from "./machine";

export const WIZARD_STORAGE_KEY = "gch-formation-wizard";

interface WizardStore extends WizardState {
  lastSavedAt?: string;
  dispatch: (event: WizardEvent) => void;
}

type PersistedWizard = Pick<WizardStore, "currentStep" | "draft" | "phase" | "submission" | "lastSavedAt">;

/**
 * Persisted wizard store. Everything the user types is saved to localStorage
 * (debounced by the step forms), so a refresh or closed tab never loses
 * progress. Transitions are delegated to the pure `wizardReducer`.
 */
export const useWizardStore = create<WizardStore>()(
  persist(
    (set) => ({
      ...initialWizardState,
      dispatch: (event) =>
        set((state) => {
          const next = wizardReducer(state, event);
          return {
            ...next,
            lastSavedAt: event.type === "SAVE_STEP" ? new Date().toISOString() : state.lastSavedAt,
          };
        }),
    }),
    {
      name: WIZARD_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s): PersistedWizard => ({
        currentStep: s.currentStep,
        draft: s.draft,
        phase: s.phase,
        submission: s.submission,
        lastSavedAt: s.lastSavedAt,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PersistedWizard>;
        // A refresh mid-submit leaves "submitting" with no request in flight — let the user retry.
        const phase = p.phase === "submitting" ? "editing" : (p.phase ?? current.phase);
        return { ...current, ...p, phase };
      },
    },
  ),
);

/** Rehydrate from localStorage on the client only (avoids SSR hydration mismatches). */
export function useWizardHydration(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const unsub = useWizardStore.persist.onFinishHydration(() => setHydrated(true));
    void useWizardStore.persist.rehydrate();
    if (useWizardStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);
  return hydrated;
}

export const useWizardDispatch = () => useWizardStore((s) => s.dispatch);
