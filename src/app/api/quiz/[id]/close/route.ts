import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ok } from "@/lib/http";
import { quizIdempotencyKey, quizProblem } from "@/modules/quiz/http";
import { closeQuizQuestion } from "@/modules/quiz/service";

const bodySchema = z.object({ force: z.boolean().optional().default(true) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request.headers);
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    return ok(await closeQuizQuestion(id, admin.id, quizIdempotencyKey(request), body.force));
  } catch (error) {
    const response = quizProblem(error);
    if (response) return response;
    throw error;
  }
}
