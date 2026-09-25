"use client";

import { useEffect } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import type { FormStepId, WizardDraft } from "@/lib/wizard/machine";
import { useWizardDispatch } from "@/lib/wizard/store";

/**
 * Debounced auto-save of a step form into the persisted wizard store.
 * Pending changes are flushed on unmount so navigating away never drops input.
 */
export function useAutoSave<T extends FieldValues>(step: FormStepId, form: UseFormReturn<T, unknown, T>, delay = 400) {
  const dispatch = useWizardDispatch();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: unknown;
    const flush = () => {
      if (pending === undefined) return;
      dispatch({ type: "SAVE_STEP", step, values: pending as WizardDraft[FormStepId] });
      pending = undefined;
    };
    const subscription = form.watch((values) => {
      pending = structuredClone(values);
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    });
    return () => {
      clearTimeout(timer);
      flush();
      subscription.unsubscribe();
    };
  }, [form, step, dispatch, delay]);
}
