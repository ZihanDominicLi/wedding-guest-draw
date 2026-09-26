import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { ok } from "@/lib/http";
import { createQuizSession } from "@/modules/quiz/service";
import { quizIdempotencyKey, quizProblem } from "@/modules/quiz/http";

const questionSchema = z.object({ prompt: z.string().trim().min(1).max(500), options: z.array(z.unknown()).min(2).max(8), correctOption: z.number().int().min(0).nullable().default(null), explanation: z.string().trim().max(1000).optional(), timeLimitSeconds: z.number().int().min(5).max(300).optional() });
const createSchema = z.object({ title: z.string().trim().min(1).max(100), defaultTimeLimitSeconds: z.number().int().min(5).max(300).optional(), questions: z.array(questionSchema).min(1).max(10) });

export async function POST(request: Request) {
  try {
    const administrator = await requireAdmin(request.headers);
    return ok(await createQuizSession(createSchema.parse(await request.json()), administrator.id, quizIdempotencyKey(request)), { status: 201 });
  } catch (error) {
    const response = quizProblem(error);
    if (response) return response;
    throw error;
  }
}
