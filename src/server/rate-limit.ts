import { NextResponse } from "next/server";
import { db } from "./db";

/**
 * Sliding-window rate limiter (two fixed windows, weighted), backed by
 * Postgres so limits hold across every server instance.
 */

export interface RateLimitRule {
  /** Namespace, e.g. "name-check:ip". */
  name: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until a request would be allowed again (0 when allowed). */
  retryAfter: number;
  resetAt: number;
}

/** Storage for window counters; Postgres in production, memory in tests. */
export interface RateLimitStore {
  /** Increment the counter for (key, windowStart) and return [current, previousWindow] counts. */
  hit(key: string, windowStart: number, windowMs: number): Promise<[number, number]>;
  /** Undo a hit that was rejected, so blocked retries don't extend the block. */
  release(key: string, windowStart: number): Promise<void>;
}

export class PostgresRateLimitStore implements RateLimitStore {
  async hit(key: string, windowStart: number, windowMs: number): Promise<[number, number]> {
    const prisma = db();
    const start = new Date(windowStart);
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "expiresAt")
      VALUES (${key}, ${start}, 1, ${new Date(windowStart + 2 * windowMs)})
      ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
      RETURNING "count"`;
    const previous = await prisma.rateLimitBucket.findUnique({
      where: { key_windowStart: { key, windowStart: new Date(windowStart - windowMs) } },
      select: { count: true },
    });
    // Opportunistic cleanup keeps the table small without a cron job.
    if (Math.random() < 0.01) await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return [Number(rows[0]?.count ?? 1), previous?.count ?? 0];
  }

  async release(key: string, windowStart: number): Promise<void> {
    await db().rateLimitBucket.updateMany({ where: { key, windowStart: new Date(windowStart), count: { gt: 0 } }, data: { count: { decrement: 1 } } });
  }
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, number>();
  async hit(key: string, windowStart: number, windowMs: number): Promise<[number, number]> {
    const current = (this.buckets.get(`${key}|${windowStart}`) ?? 0) + 1;
    this.buckets.set(`${key}|${windowStart}`, current);
    return [current, this.buckets.get(`${key}|${windowStart - windowMs}`) ?? 0];
  }

  async release(key: string, windowStart: number): Promise<void> {
    const k = `${key}|${windowStart}`;
    this.buckets.set(k, Math.max(0, (this.buckets.get(k) ?? 0) - 1));
  }
}

/**
 * Earliest delay (ms) after which one more request fits under the limit,
 * given the current window's count (excluding the rejected request) and the
 * previous window's count. Accounts for the current window becoming the
 * weighted "previous" window after rollover.
 */
export function msUntilAllowed(opts: { current: number; previous: number; limit: number; windowMs: number; elapsedMs: number }): number {
  const { current, previous, limit, windowMs: W, elapsedMs: e } = opts;
  // Still in this window: current + 1 + previous * (1 - (e + d) / W) <= limit
  if (previous > 0) {
    const d = ((current + 1 + previous * (1 - e / W) - limit) * W) / previous;
    if (d < W - e) return Math.max(0, d);
  }
  // After rollover the current count decays as the previous window: 1 + current * (1 - x / W) <= limit
  const x = current > limit - 1 ? W * (1 - (limit - 1) / current) : 0;
  return W - e + x;
}

/** Multiplies every limit (e.g. RATE_LIMIT_SCALE=100 for local e2e runs). 0 disables limiting. */
function scale(): number {
  const raw = Number(process.env.RATE_LIMIT_SCALE ?? 1);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1;
}

export async function checkRateLimit(
  rule: RateLimitRule,
  subject: string,
  opts: { store?: RateLimitStore; now?: number } = {},
): Promise<RateLimitResult> {
  const now = opts.now ?? Date.now();
  const s = scale();
  const limit = Math.max(1, Math.round(rule.limit * (s || 1)));
  const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
  const resetAt = windowStart + rule.windowMs;
  if (s === 0) return { allowed: true, limit, remaining: limit, retryAfter: 0, resetAt };

  const key = `${rule.name}:${subject}`;
  const s2 = opts.store ?? store();
  const [current, previous] = await s2.hit(key, windowStart, rule.windowMs);
  const elapsedMs = now - windowStart;
  const estimated = current + previous * (1 - elapsedMs / rule.windowMs);
  const allowed = estimated <= limit;
  let retryAfter = 0;
  if (!allowed) {
    await s2.release(key, windowStart);
    const wait = msUntilAllowed({ current: current - 1, previous, limit, windowMs: rule.windowMs, elapsedMs });
    retryAfter = Math.max(1, Math.ceil(wait / 1000));
  }
  return { allowed, limit, remaining: Math.max(0, Math.floor(limit - estimated)), retryAfter, resetAt };
}

let defaultStore: RateLimitStore | undefined;
function store(): RateLimitStore {
  defaultStore ??= new PostgresRateLimitStore();
  return defaultStore;
}

/** Best-effort client IP. Behind a proxy we trust the first X-Forwarded-For hop (set TRUST_PROXY=0 to disable). */
export function clientIp(request: Request): string {
  if (process.env.TRUST_PROXY !== "0") {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
    const real = request.headers.get("x-real-ip");
    if (real) return real;
  }
  if (process.env.NODE_ENV === "production" && !warnedNoIp) {
    warnedNoIp = true;
    console.warn("[rate-limit] No client IP header — all clients share one bucket. Run behind a proxy that sets X-Forwarded-For.");
  }
  return "unknown";
}

let warnedNoIp = false;

export const RATE_LIMITS = {
  nameCheckMinute: { name: "name-check:ip:1m", limit: 30, windowMs: 60_000 },
  nameCheckDay: { name: "name-check:ip:1d", limit: 1_000, windowMs: 24 * 60 * 60_000 },
  loginEmail: { name: "login:email", limit: 5, windowMs: 15 * 60_000 },
  loginIp: { name: "login:ip", limit: 20, windowMs: 15 * 60_000 },
  verifyIp: { name: "verify:ip", limit: 30, windowMs: 15 * 60_000 },
  formationIp: { name: "formation:ip", limit: 10, windowMs: 60 * 60_000 },
  signIp: { name: "sign:ip", limit: 30, windowMs: 15 * 60_000 },
} satisfies Record<string, RateLimitRule>;

/**
 * Check several limits; returns a ready 429 response for the first one
 * exceeded, or undefined when the request may proceed.
 */
export async function enforceRateLimits(checks: [RateLimitRule, string][]): Promise<NextResponse | undefined> {
  for (const [rule, subject] of checks) {
    let result: RateLimitResult;
    try {
      result = await checkRateLimit(rule, subject);
    } catch (error) {
      // Fail open: a limiter outage must not take the product down.
      console.error(`[rate-limit] ${rule.name} check failed`, error);
      continue;
    }
    if (!result.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: `Too many requests — please wait ${result.retryAfter} seconds and try again.`, retryAfter: result.retryAfter } },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfter),
            "RateLimit-Limit": String(result.limit),
            "RateLimit-Remaining": "0",
            "RateLimit-Reset": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }
  }
  return undefined;
}
