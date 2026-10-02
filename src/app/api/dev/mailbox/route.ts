import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { devMailboxEnabled } from "@/server/email";

/** GET /api/dev/mailbox?to=… — recent emails, only when DEV_MAILBOX=1 (local development and tests). */
export async function GET(request: Request) {
  if (!devMailboxEnabled()) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  const to = new URL(request.url).searchParams.get("to")?.toLowerCase();
  const messages = await db().emailMessage.findMany({
    where: to ? { to } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, to: true, subject: true, text: true, category: true, status: true, createdAt: true },
  });
  return NextResponse.json({ messages });
}
