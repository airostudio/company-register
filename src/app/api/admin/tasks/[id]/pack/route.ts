import { NextResponse, type NextRequest } from "next/server";
import { renderLodgementPack, renderTaxWorksheet } from "@/lib/documents";
import type { TaxApplication } from "@/lib/tax/application";
import type { FormationPayload } from "@/lib/registry/types";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/session";

/** GET /api/admin/tasks/:id/pack — internal lodgement data sheet (PDF). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireAdmin())) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Ops access required" } }, { status: 403 });
  const task = await db().opsTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, { status: 404 });
  const pdf =
    task.kind === "LODGEMENT"
      ? await renderLodgementPack(task.payload as unknown as FormationPayload, task.reference)
      : await renderTaxWorksheet(task.payload as unknown as TaxApplication, task.reference);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${task.reference}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
