import { ZodError } from "zod";

import { ok, problem } from "@/lib/http";
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
    const result = await registerGuest(await request.json(), idempotencyKey);
    return ok(result);
  } catch (error) {
    if (error instanceof RegistrationClosedError) {
      return problem(403, "REGISTRATION_CLOSED", "现场登记尚未开放");
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return problem(422, "INVALID_REGISTRATION", "请检查登记信息");
    }
    throw error;
  }
}
