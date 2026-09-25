import { requireAdmin } from "@/lib/auth";
import { ok } from "@/lib/http";
import { getQuizSessionStats, getQuizState } from "@/modules/quiz/service";
import { quizProblem } from "@/modules/quiz/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(_request.headers);
    const { id } = await context.params;
    const [state, stats] = await Promise.all([getQuizState(id), getQuizSessionStats(id)]);
    return ok({ ...state, stats });
  } catch (error) {
    const response = quizProblem(error);
    if (response) return response;
    throw error;
  }
}
