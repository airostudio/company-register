import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, MemoryRateLimitStore } from "./rate-limit";

const rule = { name: "test", limit: 3, windowMs: 60_000 };

// Pin the scale: a developer's .env (loaded by Vitest) may relax limits for local e2e runs.
beforeEach(() => {
  process.env.RATE_LIMIT_SCALE = "1";
});

describe("checkRateLimit", () => {
  it("allows up to the limit in a window, then blocks with a Retry-After", async () => {
    const store = new MemoryRateLimitStore();
    const t = 120_000; // start of a window
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit(rule, "ip-1", { store, now: t + i }));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[2]!.remaining).toBe(0);
    expect(results[3]!.retryAfter).toBeGreaterThan(0);
  });

  it("keeps subjects independent", async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 3; i++) await checkRateLimit(rule, "a", { store, now: 0 });
    expect((await checkRateLimit(rule, "b", { store, now: 0 })).allowed).toBe(true);
  });

  it("weights the previous window so bursts at a boundary are still limited", async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 3; i++) await checkRateLimit(rule, "ip", { store, now: 59_000 });
    // 1s into the next window the previous window still counts ~98%.
    expect((await checkRateLimit(rule, "ip", { store, now: 61_000 })).allowed).toBe(false);
    // Near the end of the next window the old burst has mostly decayed.
    expect((await checkRateLimit(rule, "ip", { store, now: 115_000 })).allowed).toBe(true);
  });

  it("can be scaled or disabled by environment", async () => {
    process.env.RATE_LIMIT_SCALE = "2";
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 6; i++) expect((await checkRateLimit(rule, "x", { store, now: 0 })).allowed).toBe(true);
    expect((await checkRateLimit(rule, "x", { store, now: 0 })).allowed).toBe(false);
    process.env.RATE_LIMIT_SCALE = "0";
    for (let i = 0; i < 20; i++) expect((await checkRateLimit(rule, "y", { store, now: 0 })).allowed).toBe(true);
  });
});

describe("retry timing", () => {
  it("doesn't count rejected requests, and Retry-After is the earliest time a request passes", async () => {
    const store = new MemoryRateLimitStore();
    const W = rule.windowMs;
    for (let i = 0; i < 3; i++) await checkRateLimit(rule, "r", { store, now: 10_000 });
    let blocked = await checkRateLimit(rule, "r", { store, now: 10_000 });
    for (let i = 0; i < 10; i++) blocked = await checkRateLimit(rule, "r", { store, now: 10_000 }); // hammering doesn't extend the block
    expect(blocked.allowed).toBe(false);
    // 3 hits fill the window; after rollover they weigh 3*(1-x/W) so one request fits once x >= W/3.
    const expected = W - 10_000 + W / 3;
    expect(blocked.retryAfter).toBe(Math.ceil(expected / 1000));
    expect((await checkRateLimit(rule, "r", { store, now: 10_000 + expected - 1_000 })).allowed).toBe(false);
    expect((await checkRateLimit(rule, "r", { store, now: 10_000 + expected + 1 })).allowed).toBe(true);
  });
});
