import { ZodError } from "zod";

import { UnauthorizedError } from "@/lib/auth";
import { problem } from "@/lib/http";
import { InvalidIdempotencyKeyError } from "@/lib/idempotency";
import { QuizParticipantError, QuizStateError, QuizValidationError } from "./types";

export function quizProblem(error: unknown): Response | null {
  if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
  if (error instanceof QuizParticipantError) return problem(403, "QUIZ_PARTICIPANT_INVALID", "请先完成现场登记");
  if (error instanceof QuizStateError) return problem(409, "QUIZ_STATE_CHANGED", "答题状态已变化，请刷新页面");
  if (error instanceof QuizValidationError || error instanceof InvalidIdempotencyKeyError || error instanceof ZodError) return problem(422, "INVALID_QUIZ_REQUEST", "答题参数无效");
  return null;
}

export function quizIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key");
  if (!value) throw new QuizValidationError("Idempotency key is required");
  return value;
}
