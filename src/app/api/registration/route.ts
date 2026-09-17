import { ZodError } from "zod";

import { ok, problem } from "@/lib/http";
import { consumeRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import {
  registerGuest,
  RegistrationClosedError,
} from "@/modules/registration/service";

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return problem(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "缺少提交标识，请刷新后重试",
    );
  }

  try {
    const clientIp = request.headers.get("x-real-ip") ?? "unknown";
    await consumeRateLimit(`registration:${clientIp}`, { limit: 30, windowSeconds: 300 });
    const result = await registerGuest(await request.json(), idempotencyKey);
    return ok(result);
  } catch (error) {
    if (error instanceof RegistrationClosedError) {
      return problem(403, "REGISTRATION_CLOSED", "现场登记尚未开放");
    }
    if (error instanceof RateLimitExceededError) {
      return Response.json(
        { error: { code: "RATE_LIMITED", message: "登记请求过于频繁，请稍后重试" } },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return problem(422, "INVALID_REGISTRATION", "请检查登记信息");
    }
    throw error;
  }
}
