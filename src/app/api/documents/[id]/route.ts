import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { errorResponse } from "@/server/errors";
import { getSessionUserId } from "@/server/session";
import { storage } from "@/server/storage";

/** GET /api/documents/:id — download a document from the vault (owner only). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to download documents" } }, { status: 401 });

  try {
    const doc = await db().document.findFirst({ where: { id, company: { ownerId: userId } } });
    if (!doc) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Document not found" } }, { status: 404 });

    const content = await storage().get(doc.storageKey);
    const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(Buffer.from(content), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(content.byteLength),
        "Content-Disposition": `${disposition}; filename="${doc.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
