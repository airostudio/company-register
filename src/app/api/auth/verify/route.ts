import { NextResponse, type NextRequest } from "next/server";
import { consumeLoginToken } from "@/server/auth";
import { createSession } from "@/server/session";
import { appUrl, safeRedirect } from "@/server/urls";

/** GET /api/auth/verify?token=… — redeem a magic link, start a session and redirect. */
export async function GET(request: NextRequest) {
  const base = appUrl(request);
  const token = request.nextUrl.searchParams.get("token");
  const result = token ? await consumeLoginToken(token) : ({ ok: false, reason: "invalid" } as const);
  if (!result.ok) return NextResponse.redirect(`${base}/login?error=${result.reason}`, 303);
  await createSession(result.user.id);
  return NextResponse.redirect(`${base}${safeRedirect(result.redirectTo)}`, 303);
}
