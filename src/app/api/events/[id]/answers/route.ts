import { z } from "zod";

import { ok, problem } from "@/lib/http";
import { readParticipantToken } from "@/modules/quiz/participant-token";
import { submitEventAnswer } from "@/modules/quiz/service";
import { quizProblem } from "@/modules/quiz/http";

const answerSchema = z.object({
  questionId: z.string().uuid(),
  optionIndex: z.number().int().min(0),
  submissionId: z.string().trim().min(1).max(160),
});

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const token = readParticipantToken(request);
    if (!token) return noStore(problem(403, "REGISTRATION_REQUIRED", "请先完成现场登记"));
    const { id } = await context.params;
    return noStore(ok(await submitEventAnswer(id, token, answerSchema.parse(await request.json()))));
  } catch (error) {
    const response = quizProblem(error);
    if (response) return noStore(response);
    throw error;
  }
}
