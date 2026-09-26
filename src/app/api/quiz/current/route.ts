import { ok, problem } from "@/lib/http";
import { db } from "@/lib/db";
import { hashParticipantToken, readParticipantToken } from "@/modules/quiz/participant-token";
import { getParticipantQuizState } from "@/modules/quiz/service";
import { quizProblem } from "@/modules/quiz/http";

export async function GET(request: Request) {
  try {
    const token = readParticipantToken(request);
    if (!token) return problem(403, "REGISTRATION_REQUIRED", "请先完成现场登记");
    const tokenHash = hashParticipantToken(token);
    const [participant, guest] = await Promise.all([
      db.quizParticipant.findFirst({
        where: { tokenHash, guest: { enabled: true }, session: { status: { in: ["READY", "LIVE", "REVIEW", "FINISHED"] } } },
        orderBy: { createdAt: "desc" },
      }),
      db.guest.findFirst({ where: { enabled: true, registrationTokenHash: tokenHash } }),
    ]);
    if (!participant && !guest) return problem(403, "REGISTRATION_REQUIRED", "请先完成现场登记");
    const session = guest
      ? await db.quizSession.findFirst({ where: { status: { in: ["READY", "LIVE", "REVIEW", "FINISHED"] } }, orderBy: { createdAt: "desc" }, select: { id: true } })
      : null;
    const targetSession = guest
      ? session
      : participant
        ? { id: participant.sessionId }
        : null;
    if (!targetSession) return problem(404, "QUIZ_NOT_AVAILABLE", "答题场次尚未开放");
    return ok(await getParticipantQuizState(targetSession.id, token));
  } catch (error) {
    const response = quizProblem(error);
    if (response) return response;
    throw error;
  }
}
