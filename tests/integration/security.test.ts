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

  it("serializes a safe replay value and can rebuild a delivery-only value", async () => {
    const first = await withIdempotency(
      `${marker}:token-scope`,
      "same-token-key",
      async () => ({ guestId: "guest-1", rawToken: "secret-token" }),
      {
        serialize: (value) => ({ guestId: value.guestId }),
        onReplay: async (stored) => ({
          ...(stored as { guestId: string }),
          rawToken: "rotated-token",
        }),
      },
    );
    const replay = await withIdempotency(
      `${marker}:token-scope`,
      "same-token-key",
      async () => ({ guestId: "guest-2", rawToken: "wrong-token" }),
      {
        serialize: (value) => ({ guestId: value.guestId }),
        onReplay: async (stored) => ({
          ...(stored as { guestId: string }),
          rawToken: "rotated-token",
        }),
      },
    );

    expect(first.rawToken).toBe("secret-token");
    expect(replay).toEqual({ guestId: "guest-1", rawToken: "rotated-token" });
    const persisted = await db.idempotencyRecord.findUnique({
      where: { scope_key: { scope: `${marker}:token-scope`, key: "same-token-key" } },
    });
    expect(persisted?.responseJson).toEqual({ guestId: "guest-1" });
  });
});
