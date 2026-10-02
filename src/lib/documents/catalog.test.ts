import { describe, expect, it } from "vitest";
import type { DocumentType } from "@/lib/domain";
import { listJurisdictions } from "@/lib/jurisdictions";
import { buildFormationPayload } from "@/lib/registry/payload";
import { buildApplication } from "@/test/fixtures";
import { documentContextFromPayload } from "./context";
import { generateDocumentPack, TEMPLATES, templateFingerprint, templateFor } from "./index";

const LEGAL: DocumentType[] = ["CONSTITUTION", "BYLAWS", "OPERATING_AGREEMENT", "ARTICLES_OF_ASSOCIATION", "SHARE_CERTIFICATE", "CONSENT_TO_ACT"];

describe("legal template catalog", () => {
  it("covers every legal document in every formation pack", () => {
    for (const j of listJurisdictions()) {
      for (const e of j.entityTypes) {
        for (const type of e.documentPack.filter((t) => LEGAL.includes(t))) {
          expect(templateFor(type, j.code, e.type), `${type} for ${j.code}/${e.type}`).toBeDefined();
        }
      }
    }
  });

  it("has unique ids and stable, distinct fingerprints", () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    const prints = TEMPLATES.map(templateFingerprint);
    expect(prints).toEqual(TEMPLATES.map(templateFingerprint)); // deterministic
    expect(new Set(prints).size).toBe(prints.length);
    for (const p of prints) expect(p).toMatch(/^[0-9a-f]{16}$/);
  });

  it("renders a preview for every template", async () => {
    for (const t of TEMPLATES) {
      const pdf = await t.renderPreview();
      expect(Buffer.from(pdf.slice(0, 5)).toString(), t.id).toBe("%PDF-");
    }
  });

  it("stamps generated documents and only treats the exact reviewed fingerprint as reviewed", async () => {
    const ctx = documentContextFromPayload(buildFormationPayload(buildApplication("UK", "UK_LTD"), "f"), { registryNumber: "1" });
    const articles = TEMPLATES.find((t) => t.id === "UK_ARTICLES")!;
    const reviewed = new Set([`UK_ARTICLES@${templateFingerprint(articles)}`, "CONSENT_UK@0000000000000000"]);
    const pack = await generateDocumentPack(ctx, { reviewed });
    const byType = (type: DocumentType) => pack.find((d) => d.type === type)!;
    expect(byType("ARTICLES_OF_ASSOCIATION").template).toMatchObject({ id: "UK_ARTICLES", reviewed: true });
    expect(byType("CONSENT_TO_ACT").template).toMatchObject({ id: "CONSENT_UK", reviewed: false }); // stale fingerprint
    expect(byType("SHARE_CERTIFICATE").template).toMatchObject({ id: "SHARE_CERTIFICATE_UK", reviewed: false });
    expect(byType("SHAREHOLDER_REGISTER").template).toBeUndefined();
  });
});
