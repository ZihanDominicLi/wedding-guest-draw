import { requireAdmin } from "@/lib/auth";
import { ok } from "@/lib/http";
import { getQuizState } from "@/modules/quiz/service";
import { quizProblem } from "@/modules/quiz/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(_request.headers);
    const { id } = await context.params;
    return ok(await getQuizState(id));
  } catch (error) {
    const response = quizProblem(error);
    if (response) return response;
    throw error;
  }
}
