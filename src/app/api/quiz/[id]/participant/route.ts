import { ok } from "@/lib/http";
import { readParticipantToken } from "@/modules/quiz/participant-token";
import { getParticipantQuizState } from "@/modules/quiz/service";
import { quizProblem } from "@/modules/quiz/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const token = readParticipantToken(request);
    if (!token) return quizProblem(new Error("missing")) ?? new Response(null, { status: 403 });
    const { id } = await context.params;
    return ok(await getParticipantQuizState(id, token));
  } catch (error) {
    const response = quizProblem(error);
    if (response) return response;
    throw error;
  }
}
