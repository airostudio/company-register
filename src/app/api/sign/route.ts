import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/server/errors";
import { getCurrentUser } from "@/server/session";
import { declineConsent, findRequestByToken, findRequestForUser, signConsent } from "@/server/signatures/service";

const bodySchema = z.object({
  token: z.string().optional(),
  requestId: z.string().optional(),
  action: z.enum(["sign", "decline"]),
  typedName: z.string().optional(),
  agree: z.boolean().optional(),
  reason: z.string().max(1000).optional(),
});

/** POST /api/sign — sign or decline a consent, authorised by the emailed token or the signer's own session. */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid request" } }, { status: 400 });
  const { token, requestId, action } = parsed.data;
  try {
    const user = requestId ? await getCurrentUser() : null;
    const signature = token ? await findRequestByToken(token) : requestId && user ? await findRequestForUser(requestId, user) : null;
    if (!signature) return NextResponse.json({ error: { code: "NOT_FOUND", message: "This signing link isn't valid" } }, { status: 404 });

    if (action === "sign") {
      await signConsent(signature, {
        typedName: parsed.data.typedName ?? "",
        agree: parsed.data.agree === true,
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip"),
        userAgent: request.headers.get("user-agent"),
      });
    } else {
      await declineConsent(signature, parsed.data.reason ?? "");
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
