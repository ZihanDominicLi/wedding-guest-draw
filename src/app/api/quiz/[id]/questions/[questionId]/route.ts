import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, problem } from "@/lib/http";

const schema = z.object({
  prompt: z.string().trim().min(1).max(500).optional(),
  options: z.array(z.unknown()).min(2).max(8).optional(),
  correctOption: z.number().int().min(0).nullable().optional(),
  explanation: z.string().trim().max(1000).nullable().optional(),
  timeLimitSeconds: z.number().int().min(5).max(300).nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string; questionId: string }> }) {
  try {
    const admin = await requireAdmin(request.headers);
    const { id, questionId } = await context.params;
    const input = schema.parse(await request.json());
    const question = await db.quizQuestion.findFirst({ where: { id: questionId, sessionId: id }, include: { session: true } });
    if (!question) return problem(404, "QUIZ_NOT_FOUND", "题目不存在");
    if (!["DRAFT", "READY"].includes(question.session.status)) return problem(409, "QUIZ_LOCKED", "答题开始后不能修改题目");
    const options = input.options ?? (Array.isArray(question.options) ? question.options : []);
    const optionsJson = JSON.parse(JSON.stringify(options)) as Prisma.InputJsonValue;
    const correctOption = input.correctOption !== undefined ? input.correctOption : question.correctOption;
    if (correctOption !== null && correctOption >= options.length) return problem(422, "INVALID_QUIZ_REQUEST", "正确答案超出选项范围");
    const updated = await db.$transaction(async (transaction) => {
      const result = await transaction.quizQuestion.update({ where: { id: questionId }, data: { ...input, options: optionsJson, correctOption } });
      await transaction.auditEvent.create({ data: { actorId: admin.id, action: "quiz.question_updated", entityType: "QuizQuestion", entityId: questionId, afterJson: { order: result.order } } });
      return result;
    });
    return ok({ id: updated.id, order: updated.order, prompt: updated.prompt, options: updated.options, correctOption: updated.correctOption, explanation: updated.explanation, timeLimitSeconds: updated.timeLimitSeconds });
  } catch (error) {
    if (error instanceof z.ZodError) return problem(422, "INVALID_QUIZ_REQUEST", "题目参数无效");
    throw error;
  }
}
