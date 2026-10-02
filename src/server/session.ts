import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { User } from "@prisma/client";
import { db } from "./db";

/**
 * Database-backed sessions. The cookie carries a random 256-bit token; only
 * its SHA-256 hash is stored, so a database leak doesn't leak live sessions.
 */

const COOKIE = "gch_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_AFTER_MS = 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string): Promise<void> {
  const token = newToken();
  const h = await headers();
  await db().session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TTL_MS),
      userAgent: h.get("user-agent")?.slice(0, 300),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://"),
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

/** The signed-in user for this request (memoised per request). */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db().session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  if (Date.now() - session.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
    await db().session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + TTL_MS) },
    });
  }
  return session.user;
});

export async function getSessionUserId(): Promise<string | undefined> {
  return (await getCurrentUser())?.id;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db().session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(COOKIE);
}

export async function requireAdmin(): Promise<User | null> {
  const user = await getCurrentUser();
  return user?.role === "ADMIN" ? user : null;
}
