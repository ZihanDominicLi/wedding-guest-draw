import { db } from "@/lib/db";

export class RateLimitExceededError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Rate limit exceeded");
    this.name = "RateLimitExceededError";
  }
}

export async function consumeRateLimit(
  bucketKey: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
) {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + windowMs);
  const bucket = await db.rateLimitBucket.upsert({
    where: { bucketKey_windowStart: { bucketKey, windowStart } },
    create: { bucketKey, windowStart, expiresAt, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (bucket.count > limit) {
    throw new RateLimitExceededError(Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)));
  }
  return { remaining: limit - bucket.count, expiresAt };
}
