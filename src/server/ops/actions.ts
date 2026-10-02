import type { OpsTask, OpsTaskStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db, toJson } from "../db";
import { AppError } from "../errors";
import { fulfilApprovedFiling, syncFilingStatus } from "../formations/lodgement";
import { documentKey, storage } from "../storage";
import { syncTaxRegistration } from "../tax/service";
import type { OpsTaskDocument } from "./tasks";

export const OPS_ACTIONS = ["claim", "lodged", "approve", "action_required", "resume", "reject", "note"] as const;
export type OpsAction = (typeof OPS_ACTIONS)[number];

/** Which actions are allowed from each status. */
const ALLOWED: Record<OpsTaskStatus, OpsAction[]> = {
  OPEN: ["claim", "lodged", "approve", "action_required", "reject", "note"],
  IN_PROGRESS: ["lodged", "approve", "action_required", "reject", "note"],
  SUBMITTED: ["approve", "action_required", "reject", "note"],
  ACTION_REQUIRED: ["resume", "reject", "note"],
  COMPLETED: ["note"],
  REJECTED: ["note"],
};

export function allowedActions(status: OpsTaskStatus): OpsAction[] {
  return ALLOWED[status];
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({ action: z.literal("lodged"), externalReference: z.string().trim().min(2, "Enter the authority's reference") }),
  z.object({
    action: z.literal("approve"),
    resultNumber: z.string().trim().min(3, "Enter the number the authority issued"),
    resultDate: z.iso.date("Enter the date as YYYY-MM-DD"),
  }),
  z.object({ action: z.literal("action_required"), message: z.string().trim().min(10, "Explain what the customer needs to provide") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("reject"), message: z.string().trim().min(10, "Explain why it was rejected") }),
  z.object({ action: z.literal("note"), note: z.string().trim().min(1, "Write a note") }),
]);

async function readUploads(form: FormData, task: OpsTask): Promise<OpsTaskDocument[]> {
  const slots: { field: string; type: string; title: string }[] =
    task.kind === "LODGEMENT"
      ? [
          { field: "certificate", type: "CERTIFICATE_OF_INCORPORATION", title: `${task.authority} certificate of registration` },
          { field: "receipt", type: "REGISTRY_FILING", title: `${task.authority} lodgement receipt` },
        ]
      : [{ field: "certificate", type: "TAX_ID_CONFIRMATION", title: `${task.authority} registration confirmation` }];
  const docs: OpsTaskDocument[] = [];
  for (const slot of slots) {
    const file = form.get(slot.field);
    if (!(file instanceof File) || file.size === 0) continue;
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError(400, "FILE_TOO_LARGE", `${slot.title} is larger than 10 MB`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (Buffer.from(bytes.slice(0, 5)).toString() !== "%PDF-") throw new AppError(400, "NOT_PDF", `${slot.title} must be a PDF`);
    const fileName = `${slot.type.toLowerCase().replace(/_/g, "-")}-${task.reference.toLowerCase()}.pdf`;
    const stored = await storage().put(documentKey(task.companyId, fileName), bytes);
    docs.push({ type: slot.type, title: slot.title, fileName, storageKey: stored.key });
  }
  return docs;
}

/** Apply a staff action to a task, then push the change through to the customer's filing. */
export async function applyOpsAction(taskId: string, actorId: string, form: FormData): Promise<OpsTask> {
  const prisma = db();
  const task = await prisma.opsTask.findUnique({ where: { id: taskId } });
  if (!task) throw new AppError(404, "NOT_FOUND", "Task not found");

  const parsed = actionSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) throw new AppError(400, "INVALID_ACTION", parsed.error.issues[0]?.message ?? "Invalid action");
  const input = parsed.data;
  if (!ALLOWED[task.status].includes(input.action)) {
    throw new AppError(409, "INVALID_TRANSITION", `Can't "${input.action}" a task that is ${task.status}`);
  }

  const now = new Date();
  const stamp = `[${now.toISOString().slice(0, 16).replace("T", " ")}]`;
  let data: Prisma.OpsTaskUpdateManyMutationInput;
  switch (input.action) {
    case "claim":
      data = { status: "IN_PROGRESS", assigneeId: actorId };
      break;
    case "lodged":
      data = { status: "SUBMITTED", externalReference: input.externalReference, submittedAt: now, assigneeId: task.assigneeId ?? actorId };
      break;
    case "approve": {
      const uploads = await readUploads(form, task);
      if (task.kind === "LODGEMENT" && !uploads.some((u) => u.type === "CERTIFICATE_OF_INCORPORATION")) {
        throw new AppError(400, "CERTIFICATE_REQUIRED", "Upload the registry's certificate before approving");
      }
      data = {
        status: "COMPLETED",
        resultNumber: input.resultNumber,
        resultDate: new Date(`${input.resultDate}T00:00:00Z`),
        completedAt: now,
        message: null,
        documents: toJson([...((task.documents as OpsTaskDocument[] | null) ?? []), ...uploads]),
      };
      break;
    }
    case "action_required":
      data = { status: "ACTION_REQUIRED", message: input.message };
      break;
    case "resume":
      data = { status: task.submittedAt ? "SUBMITTED" : "IN_PROGRESS", message: null };
      break;
    case "reject":
      data = { status: "REJECTED", message: input.message, completedAt: now };
      break;
    case "note":
      data = {};
      break;
  }
  const noteLine = input.action === "note" ? input.note : `${input.action}${"message" in input ? `: ${input.message}` : ""}`;
  data.notes = `${task.notes ? `${task.notes}\n` : ""}${stamp} ${noteLine}`;

  // Compare-and-set on status so two staff members can't apply conflicting actions.
  const { count } = await prisma.opsTask.updateMany({ where: { id: task.id, status: task.status }, data });
  if (count === 0) throw new AppError(409, "STALE", "This task changed while you were working on it — reload and try again");

  if (task.filingId && input.action !== "note") {
    if (task.kind === "TAX_REGISTRATION") await syncTaxRegistration(task.filingId);
    else await advanceFiling(task.filingId, input.action === "resume");
  }
  return prisma.opsTask.findUniqueOrThrow({ where: { id: task.id } });
}

async function advanceFiling(filingId: string, resume: boolean) {
  const result = await syncFilingStatus(filingId, { resume });
  if (result.status === "APPROVED") await fulfilApprovedFiling(filingId);
}
