import { randomBytes } from "node:crypto";
import type { OpsTaskKind, Prisma } from "@prisma/client";
import type { Jurisdiction } from "@/lib/domain";
import { db, toJson } from "../db";
import { sendEmail } from "../email";
import { layout } from "../email/templates";
import { appUrl } from "../urls";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Human-friendly, unambiguous reference: OPS-<AUTHORITY>-7K2M9Q4T. */
export function opsReference(authority: string): string {
  const bytes = randomBytes(8);
  const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `OPS-${authority}-${code}`;
}

export function opsRecipients(): string[] {
  return (process.env.OPS_EMAIL ?? process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export async function createOpsTask(input: {
  kind: OpsTaskKind;
  authority: string;
  jurisdiction: Jurisdiction;
  companyId: string;
  filingId?: string;
  payload: unknown;
  summary: string;
}) {
  const task = await db().opsTask.create({
    data: {
      reference: opsReference(input.authority),
      kind: input.kind,
      authority: input.authority,
      jurisdiction: input.jurisdiction,
      companyId: input.companyId,
      filingId: input.filingId,
      payload: toJson(input.payload) as Prisma.InputJsonValue,
    },
  });
  const url = `${appUrl()}/admin/tasks/${task.id}`;
  for (const to of opsRecipients()) {
    await sendEmail({
      to,
      category: "ops",
      ...layout({
        subject: `[Ops] ${task.reference}: ${input.summary}`,
        heading: `New ${input.kind === "LODGEMENT" ? "lodgement" : "tax registration"} for ${input.authority}`,
        paragraphs: [input.summary, `Reference ${task.reference}. Everything needed to lodge is in the ops console.`],
        action: { label: "Open task", url },
        footer: "Internal notification — GlobalCorp Hub operations.",
      }),
    });
  }
  return task;
}

export interface OpsTaskDocument {
  type: string;
  title: string;
  fileName: string;
  storageKey: string;
}
