import { Prisma, type PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";
import { withTransactionIdempotency } from "@/lib/idempotency";
import { publishLiveEvent } from "@/modules/live/bus";
import { hashParticipantToken } from "./participant-token";
import { validateQuizDefinition, validateQuizForPublish, type QuizDefinitionQuestion } from "./config";
import {
  QuizParticipantError,
  QuizStateError,
  QuizValidationError,
  type QuizParticipantView,
  type QuizQuestionView,
  type QuizSessionView,
} from "./types";

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sessionView(session: {
  id: string; title: string; status: QuizSessionView["status"]; questionCount: number;
  defaultTimeLimitSeconds: number; currentQuestionIndex: number | null; startedAt: Date | null; finishedAt: Date | null;
}): QuizSessionView {
  return { ...session, startedAt: session.startedAt?.toISOString() ?? null, finishedAt: session.finishedAt?.toISOString() ?? null };
}

function questionView(question: {
  id: string; order: number; prompt: string; options: Prisma.JsonValue; timeLimitSeconds: number | null; opensAt: Date | null; closesAt: Date | null; publishedAt: Date | null;
}, defaultTimeLimitSeconds: number): QuizQuestionView {
  return {
    id: question.id, order: question.order, prompt: question.prompt, options: question.options,
    timeLimitSeconds: question.timeLimitSeconds ?? defaultTimeLimitSeconds,
    opensAt: question.opensAt?.toISOString() ?? null, closesAt: question.closesAt?.toISOString() ?? null,
    publishedAt: question.publishedAt?.toISOString() ?? null,
  };
}

function optionCount(value: Prisma.JsonValue): number {
  return Array.isArray(value) ? value.length : 0;
}

function assertStatus(status: string, allowed: string[]) {
  if (!allowed.includes(status)) throw new QuizStateError(`Quiz session is ${status}`);
}

export async function createQuizSession(input: {
  title: string; defaultTimeLimitSeconds?: number; questions: Array<QuizDefinitionQuestion & { explanation?: string; timeLimitSeconds?: number }>;
}, actorId: string, idempotencyKey: string) {
  if (!input.title.trim()) throw new QuizValidationError("Quiz title is required");
  const limit = input.defaultTimeLimitSeconds ?? 30;
  if (!Number.isInteger(limit) || limit < 5 || limit > 300) throw new QuizValidationError("Invalid time limit");
  const definitionErrors = validateQuizDefinition(input.questions);
  if (definitionErrors.length) throw new QuizValidationError(definitionErrors[0]);
  const session = await db.$transaction(async (transaction) => withTransactionIdempotency(transaction, "quiz:create", idempotencyKey, async () => {
    const created = await transaction.quizSession.create({
      data: {
        title: input.title.trim(), questionCount: input.questions.length, defaultTimeLimitSeconds: limit,
        questions: { create: input.questions.map((question, index) => ({ order: index + 1, prompt: question.prompt.trim(), options: json(question.options), correctOption: question.correctOption, explanation: question.explanation?.trim() || null, timeLimitSeconds: question.timeLimitSeconds })) },
      }, include: { questions: { orderBy: { order: "asc" } } },
    });
    await transaction.auditEvent.create({ data: { actorId, action: "quiz.session_created", entityType: "QuizSession", entityId: created.id, afterJson: json({ title: created.title, questionCount: created.questionCount }) } });
    return { session: sessionView(created), questions: created.questions.map((question) => questionView(question, created.defaultTimeLimitSeconds)) };
  }));
  publishLiveEvent({ type: "quiz.changed", scope: "admin", payload: session.session as unknown as Record<string, unknown> });
  return session;
}

export async function deleteQuizSession(sessionId: string, actorId: string) {
  const deleted = await db.$transaction(async (transaction) => {
    const session = await transaction.quizSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new QuizValidationError("Quiz session not found");
    if (session.status === "LIVE") throw new QuizStateError("Live quiz sessions cannot be deleted");
    await transaction.guest.updateMany({
      where: { quizSessionId: sessionId },
      data: { quizSessionId: null, quizScore: null, quizCompletedAt: null },
    });
    await transaction.auditEvent.create({
      data: {
        actorId,
        action: "quiz.session_deleted",
        entityType: "QuizSession",
        entityId: sessionId,
        afterJson: json({ title: session.title, status: session.status }),
      },
    });
    await transaction.quizSession.delete({ where: { id: sessionId } });
    return { id: sessionId, title: session.title };
  });
  publishLiveEvent({ type: "quiz.changed", scope: "admin", payload: { id: deleted.id, reason: "session_deleted" } });
  return deleted;
}

export async function startQuizSession(sessionId: string, actorId: string, idempotencyKey: string) {
  const result = await db.$transaction(async (transaction) => withTransactionIdempotency(transaction, `quiz:start:${sessionId}`, idempotencyKey, async () => {
    const session = await transaction.quizSession.findUnique({ where: { id: sessionId }, include: { questions: { orderBy: { order: "asc" } } } });
    if (!session) throw new QuizValidationError("Quiz session not found");
    assertStatus(session.status, ["READY"]);
    const now = new Date();
    const first = session.questions[0];
    if (!first) throw new QuizValidationError("Quiz has no questions");
    const updatedQuestion = await transaction.quizQuestion.update({ where: { id: first.id }, data: { opensAt: now, closesAt: new Date(now.getTime() + (first.timeLimitSeconds ?? session.defaultTimeLimitSeconds) * 1000), publishedAt: null } });
    const updated = await transaction.quizSession.update({ where: { id: sessionId }, data: { status: "LIVE", startedAt: now, publishedAt: now, currentQuestionIndex: 1, version: { increment: 1 } } });
    await transaction.auditEvent.create({ data: { actorId, action: "quiz.session_started", entityType: "QuizSession", entityId: sessionId, afterJson: json({ currentQuestionIndex: 1 }) } });
    return { session: sessionView(updated), question: questionView(updatedQuestion, session.defaultTimeLimitSeconds) };
  }));
  publishLiveEvent({ type: "quiz.changed", scope: "admin", payload: result.session as unknown as Record<string, unknown> });
  publishLiveEvent({ type: "quiz.question_opened", scope: "screen", payload: { sessionId, question: result.question } });
  return result;
}

export async function getQuizState(sessionId: string) {
  const session = await db.quizSession.findUnique({ where: { id: sessionId }, include: { questions: { orderBy: { order: "asc" } } } });
  if (!session) throw new QuizValidationError("Quiz session not found");
  const current = session.currentQuestionIndex ? session.questions.find((question) => question.order === session.currentQuestionIndex) : null;
  return { session: sessionView(session), question: current ? questionView(current, session.defaultTimeLimitSeconds) : null };
}

export async function getQuizSessionStats(sessionId: string) {
  const session = await db.quizSession.findUnique({
    where: { id: sessionId },
    select: { currentQuestionIndex: true, questions: { select: { id: true, order: true } } },
  });
  if (!session) throw new QuizValidationError("Quiz session not found");
  const current = session.currentQuestionIndex
    ? session.questions.find((question) => question.order === session.currentQuestionIndex)
    : null;
  const [participantCount, completedCount, scoreAggregate, submittedCount, skippedCount] = await Promise.all([
    db.quizParticipant.count({ where: { sessionId } }),
    db.quizParticipant.count({ where: { sessionId, status: "COMPLETED" } }),
    db.quizParticipant.aggregate({ where: { sessionId }, _avg: { score: true } }),
    current ? db.quizAnswer.count({ where: { questionId: current.id, isLate: false } }) : Promise.resolve(0),
    current ? db.quizAnswer.count({ where: { questionId: current.id, isLate: true } }) : Promise.resolve(0),
  ]);
  return { id: sessionId, participantCount, submittedCount, skippedCount, completedCount, averageScore: scoreAggregate._avg.score ?? 0 };
}

async function participantForToken(transaction: Transaction, sessionId: string, token: string) {
  const tokenHash = hashParticipantToken(token);
  const participant = await transaction.quizParticipant.findFirst({ where: { sessionId, tokenHash, guest: { enabled: true } }, include: { session: true } });
  if (participant) return participant;
  const guest = await transaction.guest.findFirst({
    where: { registrationTokenHash: tokenHash, enabled: true },
    select: { id: true },
  });
  if (guest) {
    await transaction.quizParticipant.upsert({
      where: { sessionId_guestId: { sessionId, guestId: guest.id } },
      create: { sessionId, guestId: guest.id, tokenHash },
      update: { tokenHash },
    });
    const created = await transaction.quizParticipant.findFirst({
      where: { sessionId, guestId: guest.id },
      include: { session: true },
    });
    if (created) return created;
  }
  throw new QuizParticipantError();
}

async function recordSkippedAnswers(transaction: Transaction, sessionId: string, questionId: string) {
  const participants = await transaction.quizParticipant.findMany({
    where: { sessionId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!participants.length) return;
  await transaction.quizAnswer.createMany({
    data: participants.map((participant) => ({
      participantId: participant.id, questionId, selectedOption: null, isLate: true,
      isCorrect: null, score: 0,
    })),
    skipDuplicates: true,
  });
}

export async function getParticipantQuizState(sessionId: string, token: string) {
  const tokenHash = hashParticipantToken(token);
  let participant = await db.quizParticipant.findFirst({ where: { sessionId, tokenHash, guest: { enabled: true } }, include: { session: true } });
  if (!participant) {
    const guest = await db.guest.findFirst({
      where: { registrationTokenHash: tokenHash, enabled: true },
      select: { id: true },
    });
    if (guest) {
      participant = await db.quizParticipant.upsert({
        where: { sessionId_guestId: { sessionId, guestId: guest.id } },
        create: { sessionId, guestId: guest.id, tokenHash },
        update: { tokenHash },
        include: { session: true },
      });
    }
  }
  if (!participant) throw new QuizParticipantError();
  const state = await getQuizState(sessionId);
  const answer = state.question
    ? await db.quizAnswer.findUnique({ where: { participantId_questionId: { participantId: participant.id, questionId: state.question.id } }, include: { question: true } })
    : null;
  const revealed = Boolean(answer && (state.session.status === "REVIEW" || state.session.status === "FINISHED") && answer.question.publishedAt);
  return {
    ...state,
    question: state.question && revealed && answer && answer.question.correctOption !== null ? { ...state.question, correctOption: answer.question.correctOption, explanation: answer.question.explanation } : state.question,
    participant: {
      id: participant.id, guestId: participant.guestId, status: participant.status, score: participant.score,
      completedAt: participant.completedAt?.toISOString() ?? null,
      currentAnswer: answer ? {
        questionId: answer.questionId, selectedOption: answer.selectedOption, accepted: !answer.isLate,
        isLate: answer.isLate, isCorrect: revealed ? answer.isCorrect : null, score: revealed ? answer.score : 0,
        submittedAt: answer.submittedAt.toISOString(), published: revealed,
        ...(revealed && answer.question.correctOption !== null ? { correctOption: answer.question.correctOption, explanation: answer.question.explanation } : {}),
      } : null,
    } satisfies QuizParticipantView,
  };
}

export async function submitQuizAnswer(sessionId: string, token: string, questionId: string, selectedOption: number | null, idempotencyKey: string, now = new Date()) {
  if (selectedOption !== null && (!Number.isInteger(selectedOption) || selectedOption < 0)) throw new QuizValidationError("Invalid answer");
  try {
    const result = await db.$transaction(async (transaction) => withTransactionIdempotency(transaction, `quiz:answer:${sessionId}:${questionId}`, idempotencyKey, async () => {
    const participant = await participantForToken(transaction, sessionId, token);
    const question = await transaction.quizQuestion.findFirst({ where: { id: questionId, sessionId }, include: { session: true } });
    if (!question) throw new QuizValidationError("Question not found");
    assertStatus(question.session.status, ["LIVE"]);
    if (question.session.currentQuestionIndex !== question.order) throw new QuizStateError("Question is not current");
    if (selectedOption !== null && selectedOption >= optionCount(question.options)) throw new QuizValidationError("Invalid answer option");
    const existing = await transaction.quizAnswer.findUnique({ where: { participantId_questionId: { participantId: participant.id, questionId } } });
    if (existing) return { accepted: !existing.isLate, late: existing.isLate, score: existing.score, questionId, duplicate: true };
    const late = !question.opensAt || !question.closesAt || now < question.opensAt || now > question.closesAt;
    if (question.correctOption === null) throw new QuizStateError("Question answer is not configured");
    const answer = await transaction.quizAnswer.create({ data: { participantId: participant.id, questionId, selectedOption: late ? null : selectedOption, isLate: late, isCorrect: late || selectedOption === null ? null : selectedOption === question.correctOption, score: late || selectedOption === null ? 0 : selectedOption === question.correctOption ? 1 : 0, idempotencyKey } });
    if (!late && answer.score) await transaction.quizParticipant.update({ where: { id: participant.id }, data: { score: { increment: answer.score } } });
    return { accepted: !late, late, score: answer.score, questionId };
    }, { serialize: (value) => value }));
    publishLiveEvent({ type: "quiz.changed", scope: "admin", payload: { id: sessionId, reason: "answer_submitted" } });
    return result;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const participant = await db.quizParticipant.findFirst({ where: { sessionId, tokenHash: hashParticipantToken(token) } });
    const existing = participant ? await db.quizAnswer.findUnique({ where: { participantId_questionId: { participantId: participant.id, questionId } } }) : null;
    if (!existing) throw error;
    return { accepted: !existing.isLate, late: existing.isLate, score: existing.score, questionId, duplicate: true };
  }
}

export async function finishQuizSession(sessionId: string, actorId: string, idempotencyKey: string) {
  const result = await db.$transaction(async (transaction) => withTransactionIdempotency(transaction, `quiz:finish:${sessionId}`, idempotencyKey, async () => {
    const session = await transaction.quizSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new QuizValidationError("Quiz session not found");
    assertStatus(session.status, ["REVIEW"]);
    const participants = await transaction.quizParticipant.findMany({ where: { sessionId, status: "ACTIVE" } });
    const now = new Date();
    await transaction.quizParticipant.updateMany({ where: { sessionId, status: "ACTIVE" }, data: { status: "COMPLETED", completedAt: now } });
    for (const participant of participants) await transaction.guest.update({ where: { id: participant.guestId }, data: { quizScore: participant.score, quizCompletedAt: now, quizSessionId: sessionId } });
    const updated = await transaction.quizSession.update({ where: { id: sessionId }, data: { status: "FINISHED", finishedAt: now, version: { increment: 1 } } });
    await transaction.auditEvent.create({ data: { actorId, action: "quiz.session_finished", entityType: "QuizSession", entityId: sessionId, afterJson: json({ participantCount: participants.length }) } });
    return sessionView(updated);
  }));
  publishLiveEvent({ type: "quiz.finished", scope: "screen", payload: result as unknown as Record<string, unknown> });
  publishLiveEvent({ type: "quiz.changed", scope: "admin", payload: result as unknown as Record<string, unknown> });
  return result;
}

export async function advanceQuizQuestion(sessionId: string, actorId: string, idempotencyKey: string) {
  const result = await db.$transaction(async (transaction) => withTransactionIdempotency(transaction, `quiz:advance:${sessionId}`, idempotencyKey, async () => {
    const session = await transaction.quizSession.findUnique({ where: { id: sessionId }, include: { questions: { orderBy: { order: "asc" } } } });
    if (!session) throw new QuizValidationError("Quiz session not found");
    // After the host reveals an answer the session enters REVIEW. Advancing
    // from REVIEW is the normal transition to the next timed question.
    assertStatus(session.status, ["REVIEW"]);
    const nextIndex = (session.currentQuestionIndex ?? 0) + 1;
    const question = session.questions.find((item) => item.order === nextIndex);
    if (!question) throw new QuizStateError("No more questions");
    const now = new Date();
    const updatedQuestion = await transaction.quizQuestion.update({ where: { id: question.id }, data: { opensAt: now, closesAt: new Date(now.getTime() + (question.timeLimitSeconds ?? session.defaultTimeLimitSeconds) * 1000), publishedAt: null } });
    const updated = await transaction.quizSession.update({ where: { id: sessionId }, data: { status: "LIVE", currentQuestionIndex: nextIndex, version: { increment: 1 } } });
    await transaction.auditEvent.create({ data: { actorId, action: "quiz.question_advanced", entityType: "QuizSession", entityId: sessionId, afterJson: json({ currentQuestionIndex: nextIndex }) } });
    return { session: sessionView(updated), question: questionView(updatedQuestion, session.defaultTimeLimitSeconds) };
  }));
  publishLiveEvent({ type: "quiz.question_opened", scope: "screen", payload: { sessionId, question: result.question } });
  publishLiveEvent({ type: "quiz.changed", scope: "admin", payload: result.session as unknown as Record<string, unknown> });
  return result;
}

export async function revealQuizAnswer(sessionId: string, actorId: string, idempotencyKey: string) {
  const result = await db.$transaction(async (transaction) => withTransactionIdempotency(transaction, `quiz:reveal:${sessionId}`, idempotencyKey, async () => {
    const session = await transaction.quizSession.findUnique({ where: { id: sessionId }, include: { questions: true } });
    if (!session || session.status !== "LIVE" || !session.currentQuestionIndex) throw new QuizStateError("Question is not live");
    const question = session.questions.find((item) => item.order === session.currentQuestionIndex);
    if (!question) throw new QuizStateError("Question not found");
    if (question.correctOption === null) throw new QuizStateError("Question answer is not configured");
    if (!question.closesAt || new Date() < question.closesAt) throw new QuizStateError("Question is still live; close it before publishing");
    await recordSkippedAnswers(transaction, sessionId, question.id);
    const publishedAt = new Date();
    await transaction.quizQuestion.update({ where: { id: question.id }, data: { publishedAt } });
    const updatedSession = await transaction.quizSession.update({ where: { id: sessionId }, data: { status: "REVIEW", version: { increment: 1 } } });
    await transaction.auditEvent.create({ data: { actorId, action: "quiz.answer_revealed", entityType: "QuizQuestion", entityId: question.id, afterJson: json({ correctOption: question.correctOption }) } });
    return { session: sessionView(updatedSession), questionId: question.id, correctOption: question.correctOption, explanation: question.explanation };
  }));
  publishLiveEvent({ type: "quiz.answer_published", scope: "screen", payload: result });
  publishLiveEvent({ type: "quiz.changed", scope: "admin", payload: result.session as unknown as Record<string, unknown> });
  return result;
}

export async function closeQuizQuestion(sessionId: string, actorId: string, idempotencyKey: string, force = false) {
  const result = await db.$transaction(async (transaction) => withTransactionIdempotency(transaction, `quiz:close:${sessionId}`, idempotencyKey, async () => {
    const session = await transaction.quizSession.findUnique({ where: { id: sessionId }, include: { questions: true } });
    if (!session || session.status !== "LIVE" || !session.currentQuestionIndex) throw new QuizStateError("Question is not live");
    const question = session.questions.find((item) => item.order === session.currentQuestionIndex);
    if (!question) throw new QuizStateError("Question not found");
    const now = new Date();
    if (!force && (!question.closesAt || now < question.closesAt)) throw new QuizStateError("Question is still live");
    const closesAt = force && question.closesAt && now < question.closesAt ? now : question.closesAt;
    if (closesAt && closesAt !== question.closesAt) await transaction.quizQuestion.update({ where: { id: question.id }, data: { closesAt } });
    await recordSkippedAnswers(transaction, sessionId, question.id);
    await transaction.auditEvent.create({ data: { actorId, action: "quiz.question_closed", entityType: "QuizQuestion", entityId: question.id, reason: force ? "管理员提前收卷" : "到达截止时间", afterJson: json({ questionOrder: question.order, closesAt: closesAt?.toISOString() ?? null }) } });
    return { sessionId, questionId: question.id, closesAt: closesAt?.toISOString() ?? null };
  }));
  publishLiveEvent({ type: "quiz.question_closed", scope: "screen", payload: result });
  publishLiveEvent({ type: "quiz.changed", scope: "admin", payload: { id: sessionId, reason: "question_closed" } });
  return result;
}

export async function publishQuizSession(sessionId: string, actorId: string, idempotencyKey: string) {
  const result = await db.$transaction(async (transaction) => withTransactionIdempotency(transaction, `quiz:publish-session:${sessionId}`, idempotencyKey, async () => {
    const session = await transaction.quizSession.findUnique({ where: { id: sessionId }, include: { questions: true } });
    if (!session) throw new QuizValidationError("Quiz session not found");
    assertStatus(session.status, ["DRAFT"]);
    try {
      validateQuizForPublish(session.questions.map((question) => ({ prompt: question.prompt, options: Array.isArray(question.options) ? question.options : [], correctOption: question.correctOption })));
    } catch (error) {
      throw new QuizValidationError(error instanceof Error ? error.message : "Quiz has incomplete answers");
    }
    const updated = await transaction.quizSession.update({ where: { id: sessionId }, data: { status: "READY", publishedAt: new Date(), version: { increment: 1 } } });
    await transaction.auditEvent.create({ data: { actorId, action: "quiz.session_published", entityType: "QuizSession", entityId: sessionId, afterJson: json({ questionCount: session.questions.length }) } });
    return sessionView(updated);
  }));
  publishLiveEvent({ type: "quiz.changed", scope: "admin", payload: result as unknown as Record<string, unknown> });
  return result;
}
