import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sendLoginLink } from "@/server/auth";
import { errorResponse } from "@/server/errors";
import { appUrl, safeRedirect } from "@/server/urls";

const bodySchema = z.object({
  email: z.email("Enter a valid email address"),
  redirectTo: z.string().optional(),
});

/** POST /api/auth/login — email a magic sign-in link. Responds identically whether or not the account exists. */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request" } }, { status: 400 });
  }
  try {
    await sendLoginLink({ email: parsed.data.email, redirectTo: safeRedirect(parsed.data.redirectTo), baseUrl: appUrl(request) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
