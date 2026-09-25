import { describe, expect, it } from "vitest";
import { buildComplianceSchedule, complianceStatus } from "./calendar";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("buildComplianceSchedule", () => {
  const incorporated = new Date("2026-09-24T00:00:00Z");

  it("schedules ASIC annual reviews on the anniversary + 60 days", () => {
    const events = buildComplianceSchedule("AU", "AU_PTY_LTD", incorporated).filter((e) => e.type === "ANNUAL_REVIEW");
    expect(events.map((e) => iso(e.dueDate))).toEqual(["2027-11-23", "2028-11-23"]);
    expect(events[0]!.feeEstimate).toBe(329_00);
  });

  it("uses entity-specific Delaware obligations on fixed dates", () => {
    const llc = buildComplianceSchedule("US_DE", "US_LLC", incorporated).map((e) => [e.type, iso(e.dueDate)]);
    expect(llc).toContainEqual(["FRANCHISE_TAX", "2027-06-01"]);
    expect(llc.some(([t]) => t === "ANNUAL_REPORT")).toBe(false);

    const corp = buildComplianceSchedule("US_DE", "US_C_CORP", incorporated).map((e) => [e.type, iso(e.dueDate)]);
    expect(corp).toContainEqual(["ANNUAL_REPORT", "2027-03-01"]);
  });

  it("schedules first UK accounts 21 months after incorporation", () => {
    const accounts = buildComplianceSchedule("UK", "UK_LTD", incorporated).filter((e) => e.title === "Annual accounts");
    expect(accounts.map((e) => iso(e.dueDate))).toEqual(["2028-06-24", "2029-06-24"]);
  });

  it("returns events sorted by due date", () => {
    const dates = buildComplianceSchedule("US_WY", "US_LLC", incorporated).map((e) => e.dueDate.getTime());
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });
});

describe("complianceStatus", () => {
  const now = new Date("2026-09-24T00:00:00Z");
  it("classifies by distance to the due date", () => {
    expect(complianceStatus(new Date("2026-09-01"), now)).toBe("OVERDUE");
    expect(complianceStatus(new Date("2026-10-10"), now)).toBe("DUE_SOON");
    expect(complianceStatus(new Date("2027-01-01"), now)).toBe("UPCOMING");
    expect(complianceStatus(new Date("2026-09-01"), now, new Date())).toBe("COMPLETED");
  });
});
