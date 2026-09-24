import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as domain from "./domain";

/** Parse `enum Name { A B C }` blocks from the Prisma schema. */
function prismaEnums(): Record<string, string[]> {
  const schema = readFileSync(join(__dirname, "../../prisma/schema.prisma"), "utf8");
  const out: Record<string, string[]> = {};
  for (const [, name, body] of schema.matchAll(/enum\s+(\w+)\s*\{([^}]*)\}/g)) {
    out[name!] = body!
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, "").trim())
      .filter(Boolean);
  }
  return out;
}

describe("domain enums mirror prisma/schema.prisma", () => {
  const enums = prismaEnums();
  it.each([
    ["Jurisdiction", domain.JURISDICTIONS],
    ["EntityType", domain.ENTITY_TYPES],
    ["OfficerRole", domain.OFFICER_ROLES],
    ["ShareClass", domain.SHARE_CLASSES],
    ["FilingStatus", domain.FILING_STATUSES],
    ["CompanyStatus", domain.COMPANY_STATUSES],
    ["DocumentType", domain.DOCUMENT_TYPES],
    ["SubscriptionPlan", domain.SUBSCRIPTION_PLANS],
    ["ComplianceEventType", domain.COMPLIANCE_EVENT_TYPES],
    ["ComplianceEventStatus", domain.COMPLIANCE_EVENT_STATUSES],
  ] as const)("%s", (name, values) => {
    expect(enums[name]).toEqual([...values]);
  });
});
