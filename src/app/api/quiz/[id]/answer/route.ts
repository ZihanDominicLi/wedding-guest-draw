import { z } from "zod";

import { ok } from "@/lib/http";
import { readParticipantToken } from "@/modules/quiz/participant-token";
import { submitQuizAnswer } from "@/modules/quiz/service";
import { quizIdempotencyKey, quizProblem } from "@/modules/quiz/http";

const bodySchema = z.object({ questionId: z.string().uuid(), selectedOption: z.number().int().min(0).nullable() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const token = readParticipantToken(request);
    if (!token) return new Response(JSON.stringify({ error: { code: "QUIZ_PARTICIPANT_INVALID", message: "请先完成现场登记" } }), { status: 403, headers: { "Content-Type": "application/json" } });
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    return ok(await submitQuizAnswer(id, token, body.questionId, body.selectedOption, quizIdempotencyKey(request)));
  } catch (error) {
    const response = quizProblem(error);
    if (response) return response;
    throw error;
  }
}
