import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/server/errors";
import { applyOpsAction } from "@/server/ops/actions";
import { requireAdmin } from "@/server/session";
import { appUrl } from "@/server/urls";

/** POST /api/admin/tasks/:id — staff action from the ops console (HTML form post). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Ops access required" } }, { status: 403 });
  const back = `${appUrl(request)}/admin/tasks/${id}`;
  try {
    await applyOpsAction(id, admin.id, await request.formData());
    return NextResponse.redirect(`${back}?ok=1`, 303);
  } catch (error) {
    if (error instanceof AppError) return NextResponse.redirect(`${back}?error=${encodeURIComponent(error.message)}`, 303);
    console.error(error);
    return NextResponse.redirect(`${back}?error=${encodeURIComponent("Something went wrong — check the server log")}`, 303);
  }
}
