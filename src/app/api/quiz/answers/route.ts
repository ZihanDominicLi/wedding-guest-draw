import { z } from "zod";
import { ok, problem } from "@/lib/http";
import { readParticipantToken } from "@/modules/quiz/participant-token";
import { submitQuizAnswer } from "@/modules/quiz/service";
import { quizIdempotencyKey, quizProblem } from "@/modules/quiz/http";

const schema = z.object({ sessionId: z.string().uuid(), questionId: z.string().uuid(), selectedOption: z.number().int().min(0).nullable() });

export async function POST(request: Request) {
  try {
    const token = readParticipantToken(request);
    if (!token) return problem(403, "REGISTRATION_REQUIRED", "请先完成现场登记");
    const body = schema.parse(await request.json());
    return ok(await submitQuizAnswer(body.sessionId, token, body.questionId, body.selectedOption, quizIdempotencyKey(request)));
  } catch (error) {
    const response = quizProblem(error);
    if (response) return response;
    throw error;
  }
}
