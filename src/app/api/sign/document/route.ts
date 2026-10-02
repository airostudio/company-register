import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/session";
import { findRequestByToken, findRequestForUser } from "@/server/signatures/service";
import { storage } from "@/server/storage";

/** GET /api/sign/document?token=… | ?id=… — the exact consent PDF the signer is asked to sign. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const id = request.nextUrl.searchParams.get("id");
  const user = id ? await getCurrentUser() : null;
  const signature = token ? await findRequestByToken(token) : id && user ? await findRequestForUser(id, user) : null;
  if (!signature) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  const pdf = await storage().get(signature.documentKey);
  return new NextResponse(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="consent-to-act.pdf"', "Cache-Control": "private, no-store" },
  });
}
