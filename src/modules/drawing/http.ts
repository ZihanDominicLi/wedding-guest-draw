import { ZodError } from "zod";

import { UnauthorizedError } from "@/lib/auth";
import { problem } from "@/lib/http";
import { InvalidIdempotencyKeyError } from "@/lib/idempotency";
import {
  BackupRequiredError,
  DrawingConflictError,
  DrawingStateError,
  DrawingValidationError,
} from "./service";

export function drawingProblem(error: unknown): Response | null {
  if (error instanceof UnauthorizedError) {
    return problem(401, "UNAUTHORIZED", "需要管理员登录");
  }
  if (error instanceof DrawingConflictError) {
    return problem(409, "DRAW_CONFLICT", "候选状态已变化，请重新创建抽奖轮次");
  }
  if (error instanceof BackupRequiredError) {
    return problem(409, "BACKUP_REQUIRED", "正式抽奖前需要完成一次新备份");
  }
  if (error instanceof DrawingStateError) {
    return problem(409, "DRAW_STATE_CHANGED", "抽奖状态已变化，请刷新后重试");
  }
  if (error instanceof DrawingValidationError || error instanceof InvalidIdempotencyKeyError || error instanceof ZodError) {
    return problem(422, "INVALID_DRAW_REQUEST", "抽奖参数无效");
  }
  return null;
}

export function idempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key");
  if (!value) throw new DrawingValidationError("Idempotency key is required");
  return value;
}
