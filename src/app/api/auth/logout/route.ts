import { NextResponse, type NextRequest } from "next/server";
import { destroySession } from "@/server/session";
import { appUrl } from "@/server/urls";

/** POST /api/auth/logout — end the current session. */
export async function POST(request: NextRequest) {
  await destroySession();
  return NextResponse.redirect(`${appUrl(request)}/`, 303);
}
