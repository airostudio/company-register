import { describe, expect, it } from "vitest";
import type { EntityType, Jurisdiction } from "@/lib/domain";
import { buildFormationPayload } from "@/lib/registry/payload";
import { buildApplication } from "@/test/fixtures";
import { documentContextFromPayload } from "./context";
import { generateDocumentPack } from "./index";

const isPdf = (bytes: Uint8Array) => Buffer.from(bytes.slice(0, 5)).toString() === "%PDF-";

describe("generateDocumentPack", () => {
  it.each([
    ["AU", "AU_PTY_LTD", ["CERTIFICATE_OF_INCORPORATION", "CONSTITUTION", "SHAREHOLDER_REGISTER", "SHARE_CERTIFICATE", "SHARE_CERTIFICATE", "CONSENT_TO_ACT"]],
    ["US_DE", "US_C_CORP", ["CERTIFICATE_OF_INCORPORATION", "BYLAWS", "SHAREHOLDER_REGISTER", "SHARE_CERTIFICATE", "SHARE_CERTIFICATE", "CONSENT_TO_ACT"]],
    ["US_WY", "US_LLC", ["CERTIFICATE_OF_INCORPORATION", "OPERATING_AGREEMENT", "SHAREHOLDER_REGISTER", "CONSENT_TO_ACT"]],
    ["UK", "UK_LTD", ["CERTIFICATE_OF_INCORPORATION", "ARTICLES_OF_ASSOCIATION", "SHAREHOLDER_REGISTER", "SHARE_CERTIFICATE", "SHARE_CERTIFICATE", "CONSENT_TO_ACT"]],
  ] as [Jurisdiction, EntityType, string[]][])("renders the %s %s pack", async (j, e, expected) => {
    const payload = buildFormationPayload(buildApplication(j, e), "ref");
    const ctx = documentContextFromPayload(payload, { registryNumber: "123 456 789", incorporatedAt: "2026-09-24T00:00:00Z" });
    const docs = await generateDocumentPack(ctx);

    expect(docs.map((d) => d.type)).toEqual(expected);
    for (const d of docs) {
      expect(isPdf(d.content)).toBe(true);
      expect(d.fileName).toMatch(/^harbourview-robotics-.*\.pdf$/);
    }
    expect(new Set(docs.map((d) => d.fileName)).size).toBe(docs.length);
  });
});
