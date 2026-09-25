import { ok, problem } from "@/lib/http";
import { db } from "@/lib/db";
import { hashParticipantToken, readParticipantToken } from "@/modules/quiz/participant-token";
import { getParticipantQuizState } from "@/modules/quiz/service";
import { quizProblem } from "@/modules/quiz/http";

export async function GET(request: Request) {
  try {
    const token = readParticipantToken(request);
    if (!token) return problem(403, "REGISTRATION_REQUIRED", "请先完成现场登记");
    const participant = await db.quizParticipant.findFirst({ where: { tokenHash: hashParticipantToken(token), guest: { enabled: true }, session: { status: { in: ["READY", "LIVE", "REVIEW", "FINISHED"] } } }, orderBy: { createdAt: "desc" } });
    if (!participant) return problem(403, "REGISTRATION_REQUIRED", "请先完成现场登记");
    return ok(await getParticipantQuizState(participant.sessionId, token));
  } catch (error) {
    const response = quizProblem(error);
    if (response) return response;
    throw error;
  }
}
