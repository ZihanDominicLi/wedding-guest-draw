import { requireAdmin } from "@/lib/auth";
import { ok } from "@/lib/http";
import { quizIdempotencyKey, quizProblem } from "@/modules/quiz/http";
import { revealQuizAnswer } from "@/modules/quiz/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const admin = await requireAdmin(request.headers); const { id } = await context.params; return ok(await revealQuizAnswer(id, admin.id, quizIdempotencyKey(request))); } catch (error) { const response = quizProblem(error); if (response) return response; throw error; }
}
