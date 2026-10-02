import { NextResponse, type NextRequest } from "next/server";
import { consumeLoginToken } from "@/server/auth";
import { createSession } from "@/server/session";
import { appUrl, safeRedirect } from "@/server/urls";
import { clientIp, enforceRateLimits, RATE_LIMITS } from "@/server/rate-limit";

/** GET /api/auth/verify?token=… — redeem a magic link, start a session and redirect. */
export async function GET(request: NextRequest) {
  const base = appUrl(request);
  if (await enforceRateLimits([[RATE_LIMITS.verifyIp, clientIp(request)]])) {
    return NextResponse.redirect(`${base}/login?error=rate_limited`, 303);
  }
  const token = request.nextUrl.searchParams.get("token");
  const result = token ? await consumeLoginToken(token) : ({ ok: false, reason: "invalid" } as const);
  if (!result.ok) return NextResponse.redirect(`${base}/login?error=${result.reason}`, 303);
  await createSession(result.user.id);
  return NextResponse.redirect(`${base}${safeRedirect(result.redirectTo)}`, 303);
}
