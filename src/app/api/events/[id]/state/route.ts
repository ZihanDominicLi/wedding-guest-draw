import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { ok, problem } from "@/lib/http";
import { readParticipantToken } from "@/modules/quiz/participant-token";
import { getEventState } from "@/modules/quiz/transition";
import { quizProblem } from "@/modules/quiz/http";

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function actorForRequest(request: Request) {
  try {
    const admin = await requireAdmin(request.headers);
    return { kind: "admin" as const, actorId: admin.id };
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) throw error;
  }
  const token = readParticipantToken(request);
  return token ? { kind: "participant" as const, token } : { kind: "public" as const };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return noStore(ok(await getEventState(id, await actorForRequest(request))));
  } catch (error) {
    const response = quizProblem(error);
    if (response) return noStore(response);
    return noStore(problem(500, "EVENT_STATE_UNAVAILABLE", "活动状态暂时不可用"));
  }
}
