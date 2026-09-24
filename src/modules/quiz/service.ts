import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";
import { withTransactionIdempotency } from "@/lib/idempotency";
import { publishLiveEvent } from "@/modules/live/bus";
import { hashParticipantToken } from "./participant-token";
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

function assertStatus(status: string, allowed: string[]) {
  if (!allowed.includes(status)) throw new QuizStateError(`Quiz session is ${status}`);
}

export async function createQuizSession(input: {
  title: string; defaultTimeLimitSeconds?: number; questions: Array<{ prompt: string; options: unknown[]; correctOption: number; explanation?: string; timeLimitSeconds?: number }>;
}, actorId: string, idempotencyKey: string) {
  if (!input.title.trim() || input.questions.length !== 10) throw new QuizValidationError("A quiz must contain exactly 10 questions");
  const limit = input.defaultTimeLimitSeconds ?? 30;
  if (!Number.isInteger(limit) || limit < 5 || limit > 300) throw new QuizValidationError("Invalid time limit");
  for (const question of input.questions) {
    if (!question.prompt.trim() || question.options.length < 2 || !Number.isInteger(question.correctOption) || question.correctOption < 0 || question.correctOption >= question.options.length) throw new QuizValidationError("Invalid question");
  }
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

export async function startQuizSession(sessionId: string, actorId: string, idempotencyKey: string) {
  const result = await db.$transaction(async (transaction) => withTransactionIdempotency(transaction, `quiz:start:${sessionId}`, idempotencyKey, async () => {
    const session = await transaction.quizSession.findUnique({ where: { id: sessionId }, include: { questions: { orderBy: { order: "asc" } } } });
    if (!session) throw new QuizValidationError("Quiz session not found");
    assertStatus(session.status, ["DRAFT", "READY"]);
    const now = new Date();
    const first = session.questions[0];
    if (!first) throw new QuizValidationError("Quiz has no questions");
    const updatedQuestion = await transaction.quizQuestion.update({ where: { id: first.id }, data: { opensAt: now, closesAt: new Date(now.getTime() + (first.timeLimitSeconds ?? session.defaultTimeLimitSeconds) * 1000), publishedAt: now } });
    const updated = await transaction.quizSession.update({ where: { id: sessionId }, data: { status: "LIVE", startedAt: now, publishedAt: now, currentQuestionIndex: 1, version: { increment: 1 } } });
    await transaction.auditEvent.create({ data: { actorId, action: "quiz.session_started", entityType: "QuizSession", entityId: sessionId, afterJson: json({ currentQuestionIndex: 1 }) } });
    return { session: sessionView(updated), question: questionView(updatedQuestion, session.defaultTimeLimitSeconds) };
  }));
  publishLiveEvent({ type: "quiz.changed", scope: "admin", payload: result.session as unknown as Record<string, unknown> });
  publishLiveEvent({ type: "quiz.question", scope: "screen", payload: { sessionId, question: result.question } });
  return result;
}

export async function getQuizState(sessionId: string) {
  const session = await db.quizSession.findUnique({ where: { id: sessionId }, include: { questions: { orderBy: { order: "asc" } } } });
  if (!session) throw new QuizValidationError("Quiz session not found");
  const current = session.currentQuestionIndex ? session.questions.find((question) => question.order === session.currentQuestionIndex) : null;
  return { session: sessionView(session), question: current ? questionView(current, session.defaultTimeLimitSeconds) : null };
}

async function participantForToken(transaction: Transaction, sessionId: string, token: string) {
  const participant = await transaction.quizParticipant.findFirst({ where: { sessionId, tokenHash: hashParticipantToken(token), guest: { enabled: true } }, include: { session: true } });
  if (!participant) throw new QuizParticipantError();
  return participant;
}

export async function getParticipantQuizState(sessionId: string, token: string) {
  const participant = await db.quizParticipant.findFirst({ where: { sessionId, tokenHash: hashParticipantToken(token), guest: { enabled: true } }, include: { session: true } });
  if (!participant) throw new QuizParticipantError();
  const state = await getQuizState(sessionId);
  return { ...state, participant: { id: participant.id, guestId: participant.guestId, status: participant.status, score: participant.score, completedAt: participant.completedAt?.toISOString() ?? null } satisfies QuizParticipantView };
}

export async function submitQuizAnswer(sessionId: string, token: string, questionId: string, selectedOption: number | null, idempotencyKey: string, now = new Date()) {
  if (selectedOption !== null && (!Number.isInteger(selectedOption) || selectedOption < 0)) throw new QuizValidationError("Invalid answer");
  const result = await db.$transaction(async (transaction) => withTransactionIdempotency(transaction, `quiz:answer:${sessionId}:${questionId}`, idempotencyKey, async () => {
    const participant = await participantForToken(transaction, sessionId, token);
    const question = await transaction.quizQuestion.findFirst({ where: { id: questionId, sessionId }, include: { session: true } });
    if (!question) throw new QuizValidationError("Question not found");
    assertStatus(question.session.status, ["LIVE"]);
    if (question.session.currentQuestionIndex !== question.order) throw new QuizStateError("Question is not current");
    const late = !question.opensAt || !question.closesAt || now < question.opensAt || now > question.closesAt;
    const answer = await transaction.quizAnswer.create({ data: { participantId: participant.id, questionId, selectedOption: late ? null : selectedOption, isLate: late, isCorrect: late || selectedOption === null ? null : selectedOption === question.correctOption, score: late || selectedOption === null ? 0 : selectedOption === question.correctOption ? 1 : 0, idempotencyKey } });
    if (!late && answer.score) await transaction.quizParticipant.update({ where: { id: participant.id }, data: { score: { increment: answer.score } } });
    return { accepted: !late, late, score: answer.score, questionId };
  }, { serialize: (value) => value }));
  return result;
}

export async function finishQuizSession(sessionId: string, actorId: string, idempotencyKey: string) {
  const result = await db.$transaction(async (transaction) => withTransactionIdempotency(transaction, `quiz:finish:${sessionId}`, idempotencyKey, async () => {
    const session = await transaction.quizSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new QuizValidationError("Quiz session not found");
    assertStatus(session.status, ["LIVE", "REVIEW"]);
    const participants = await transaction.quizParticipant.findMany({ where: { sessionId, status: "ACTIVE" } });
    const now = new Date();
    await transaction.quizParticipant.updateMany({ where: { sessionId, status: "ACTIVE" }, data: { status: "COMPLETED", completedAt: now } });
    for (const participant of participants) await transaction.guest.update({ where: { id: participant.guestId }, data: { quizScore: participant.score, quizCompletedAt: now, quizSessionId: sessionId } });
    const updated = await transaction.quizSession.update({ where: { id: sessionId }, data: { status: "FINISHED", finishedAt: now, version: { increment: 1 } } });
    await transaction.auditEvent.create({ data: { actorId, action: "quiz.session_finished", entityType: "QuizSession", entityId: sessionId, afterJson: json({ participantCount: participants.length }) } });
    return sessionView(updated);
  }));
  publishLiveEvent({ type: "quiz.changed", scope: "admin", payload: result as unknown as Record<string, unknown> });
  return result;
}
