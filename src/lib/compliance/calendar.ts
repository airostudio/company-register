import type { ComplianceEventStatus, ComplianceEventType, EntityType, Jurisdiction, MinorUnits } from "@/lib/domain";
import { getJurisdiction } from "@/lib/jurisdictions";
import type { ComplianceRule } from "@/lib/jurisdictions/types";

export interface ScheduledComplianceEvent {
  type: ComplianceEventType;
  title: string;
  description: string;
  dueDate: Date;
  feeEstimate?: MinorUnits;
}

const DAY = 24 * 60 * 60 * 1000;

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function occurrences(rule: ComplianceRule, incorporatedAt: Date, count: number): Date[] {
  const s = rule.schedule;
  switch (s.kind) {
    case "anniversary":
      return Array.from({ length: count }, (_, i) => new Date(addYears(incorporatedAt, i + 1).getTime() + (s.offsetDays ?? 0) * DAY));
    case "fixed-date": {
      let first = new Date(Date.UTC(incorporatedAt.getUTCFullYear(), s.month - 1, s.day));
      if (first <= incorporatedAt) first = addYears(first, 1);
      return Array.from({ length: count }, (_, i) => addYears(first, i));
    }
    case "months-after-incorporation": {
      const first = addMonths(incorporatedAt, s.months);
      return s.thenYearly ? Array.from({ length: count }, (_, i) => addYears(first, i)) : [first];
    }
  }
}

/** Upcoming statutory obligations for a newly incorporated company. */
export function buildComplianceSchedule(
  jurisdiction: Jurisdiction,
  entityType: EntityType,
  incorporatedAt: Date,
  years = 2,
): ScheduledComplianceEvent[] {
  return getJurisdiction(jurisdiction)
    .compliance.filter((rule) => !rule.appliesTo || rule.appliesTo.includes(entityType))
    .flatMap((rule) =>
      occurrences(rule, incorporatedAt, years).map((dueDate) => ({
        type: rule.type,
        title: rule.title,
        description: rule.description,
        dueDate,
        feeEstimate: rule.feeEstimate,
      })),
    )
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/** Status is derived at read time so reminders never go stale. */
export function complianceStatus(dueDate: Date, now: Date, completedAt?: Date | null, dueSoonDays = 30): ComplianceEventStatus {
  if (completedAt) return "COMPLETED";
  const diff = dueDate.getTime() - now.getTime();
  if (diff < 0) return "OVERDUE";
  if (diff <= dueSoonDays * DAY) return "DUE_SOON";
  return "UPCOMING";
}
