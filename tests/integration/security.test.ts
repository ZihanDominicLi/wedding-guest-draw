import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { assertSameOrigin, CrossOriginRequestError } from "@/lib/csrf";
import { withIdempotency } from "@/lib/idempotency";
import { consumeRateLimit, RateLimitExceededError } from "@/lib/rate-limit";

const marker = `security-test-${Date.now()}`;

describe("security boundaries", () => {
  afterEach(async () => {
    await db.rateLimitBucket.deleteMany({ where: { bucketKey: { startsWith: marker } } });
    await db.idempotencyRecord.deleteMany({ where: { scope: { startsWith: marker } } });
  });

  it("rejects cross-origin mutations and accepts the configured origin", () => {
    expect(() => assertSameOrigin(new Request("http://127.0.0.1:3000/api/admin/settings", { method: "PUT", headers: { origin: "https://evil.example" } }))).toThrow(CrossOriginRequestError);
    expect(() => assertSameOrigin(new Request("http://127.0.0.1:3000/api/admin/settings", { method: "PUT", headers: { origin: "http://127.0.0.1:3000" } }))).not.toThrow();
  });

  it("persists a fixed-window rate limit in the database", async () => {
    await consumeRateLimit(`${marker}:registration`, { limit: 2, windowSeconds: 60 });
    await consumeRateLimit(`${marker}:registration`, { limit: 2, windowSeconds: 60 });
    await expect(consumeRateLimit(`${marker}:registration`, { limit: 2, windowSeconds: 60 })).rejects.toBeInstanceOf(RateLimitExceededError);
  });

  it("replays a completed idempotent operation once", async () => {
    let executions = 0;
    const first = await withIdempotency(`${marker}:scope`, "same-key", async () => ({ sequence: ++executions }));
    const replay = await withIdempotency(`${marker}:scope`, "same-key", async () => ({ sequence: ++executions }));
    expect(first).toEqual({ sequence: 1 });
    expect(replay).toEqual(first);
    expect(executions).toBe(1);
  });
});
