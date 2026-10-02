import { NextResponse, type NextRequest } from "next/server";
import { TEMPLATES } from "@/lib/documents";
import { requireAdmin } from "@/server/session";

/** GET /api/admin/templates/:id/preview — the template rendered with the fixed sample company. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireAdmin())) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Ops access required" } }, { status: 403 });
  const template = TEMPLATES.find((t) => t.id === id);
  if (!template) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown template" } }, { status: 404 });
  const pdf = await template.renderPreview();
  return new NextResponse(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${template.id}-${template.version}.pdf"`, "Cache-Control": "no-store" },
  });
}
