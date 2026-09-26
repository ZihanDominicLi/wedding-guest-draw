import { Prisma, type PrismaClient, type EventPhase, type QuizResultRoundType } from "@prisma/client";

import { hashParticipantToken } from "./participant-token";
import { QuizParticipantError, QuizStateError, QuizValidationError, type EventStateView, type PendingTransitionView, type QuizQuestionView, type QuizResultRoundView } from "./types";

export const DEFAULT_TRANSITION_DELAY_MS = 8_000;
const QUESTION_COUNT = 10;

export type ControlAction = "START" | "END_AND_NEXT" | "FINALIZE" | "REVEAL_NEXT" | "FINISH" | "RESUME_SETTLEMENT";

export type StateActor =
  | { kind: "admin"; actorId: string }
  | { kind: "participant"; token: string }
  | { kind: "public" };

export type TransitionTarget = {
  phase: EventPhase;
  questionIndex: number | null;
  round: number | null;
};

type PhaseInput = {
  phase: EventPhase;
  questionIndex: number | null;
  round: number | null;
};

export function isControlActionAllowed(phase: EventPhase, action: ControlAction): boolean {
  if (phase === "REGISTRATION") return action === "START";
  if (phase === "QUESTION") return action === "END_AND_NEXT" || action === "FINALIZE";
  if (phase === "SETTLING") return action === "RESUME_SETTLEMENT";
  if (phase === "QUIZ_ENDED") return action === "REVEAL_NEXT";
  if (phase === "RESULTS") return action === "REVEAL_NEXT" || action === "FINISH";
  return false;
}

export function getTransitionTarget(input: PhaseInput, action: ControlAction): TransitionTarget {
  if (!isControlActionAllowed(input.phase, action)) throw new QuizStateError(`Action ${action} is not allowed during ${input.phase}`);
  switch (action) {
    case "START":
      return { phase: "QUESTION", questionIndex: 1, round: null };
    case "END_AND_NEXT": {
      const next = (input.questionIndex ?? 0) + 1;
      return next > QUESTION_COUNT ? { phase: "SETTLING", questionIndex: null, round: null } : { phase: "QUESTION", questionIndex: next, round: null };
    }
    case "FINALIZE":
      return { phase: "SETTLING", questionIndex: null, round: null };
    case "RESUME_SETTLEMENT":
      return { phase: "QUIZ_ENDED", questionIndex: null, round: null };
    case "REVEAL_NEXT":
      return input.phase === "QUIZ_ENDED" ? { phase: "RESULTS", questionIndex: null, round: 1 } : { phase: "RESULTS", questionIndex: null, round: Math.min(5, (input.round ?? 0) + 1) };
    case "FINISH":
      if (input.round !== 5) throw new QuizStateError("All five result rounds must be revealed before finishing");
      return { phase: "FINISHED", questionIndex: null, round: 5 };
  }
}

export function redactQuestionForParticipant(question: {
  id: string;
  order: number;
  prompt: string;
  options: unknown;
  correctOption?: number | null;
  explanation?: string | null;
  timeLimitSeconds?: number | null;
  opensAt?: Date | string | null;
  closesAt?: Date | string | null;
  publishedAt?: Date | string | null;
}): QuizQuestionView {
  return {
    id: question.id,
    order: question.order,
    prompt: question.prompt,
    options: question.options,
    timeLimitSeconds: question.timeLimitSeconds ?? 30,
    opensAt: question.opensAt ? new Date(question.opensAt).toISOString() : null,
    closesAt: question.closesAt ? new Date(question.closesAt).toISOString() : null,
    publishedAt: question.publishedAt ? new Date(question.publishedAt).toISOString() : null,
  };
}

function questionForAdmin(question: {
  id: string;
  order: number;
  prompt: string;
  options: unknown;
  correctOption?: number | null;
  explanation?: string | null;
  timeLimitSeconds?: number | null;
  opensAt?: Date | string | null;
  closesAt?: Date | string | null;
  publishedAt?: Date | string | null;
}): QuizQuestionView {
  return {
    ...redactQuestionForParticipant(question),
    correctOption: question.correctOption ?? null,
    explanation: question.explanation ?? null,
  };
}

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function getDb() {
  const { db } = await import("@/lib/db");
  return db;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toPendingView(transition: {
  id: string; requestId: string; fromPhase: EventPhase; toPhase: EventPhase;
  fromQuestionIndex: number | null; toQuestionIndex: number | null; fromRound: number | null; toRound: number | null;
  effectiveAt: Date; status: PendingTransitionView["status"];
}): PendingTransitionView {
  return { ...transition, effectiveAt: transition.effectiveAt.toISOString() };
}

function resultRoundView(round: {
  id: string; round: number; type: QuizResultRoundType; requestedCount: number; eligibleCount: number;
  actualCount: number; shortage: number; actualThreshold: number | null; revealedAt: Date | null;
  winners: Array<{ id: string; ordinal: number; participantId: string; displayNameSnapshot: string; scoreSnapshot: number | null }>;
}): QuizResultRoundView {
  return {
    id: round.id, round: round.round, type: round.type, requestedCount: round.requestedCount,
    eligibleCount: round.eligibleCount, actualCount: round.actualCount, shortage: round.shortage,
    actualThreshold: round.actualThreshold, revealedAt: round.revealedAt?.toISOString() ?? null,
    winners: round.winners.map((winner) => ({ id: winner.id, round: round.round, ordinal: winner.ordinal, participantId: winner.participantId, displayName: winner.displayNameSnapshot, score: winner.scoreSnapshot })),
  };
}

function statusForPhase(phase: EventPhase): "READY" | "LIVE" | "REVIEW" | "FINISHED" {
  if (phase === "REGISTRATION") return "READY";
  if (phase === "QUESTION") return "LIVE";
  if (phase === "FINISHED") return "FINISHED";
  return "REVIEW";
}

async function participantForActor(eventId: string, actor: StateActor, transaction: Transaction | PrismaClient) {
  if (actor.kind !== "participant") return null;
  return transaction.quizParticipant.findFirst({
    where: { sessionId: eventId, tokenHash: hashParticipantToken(actor.token), guest: { enabled: true } },
    select: { id: true, totalScore: true },
  });
}

export async function applyDueTransition(eventId: string, now = new Date()): Promise<void> {
  const db = await getDb();
  await db.$transaction(async (transaction) => {
    const pending = await transaction.pendingTransition.findFirst({ where: { eventId, status: "PENDING", effectiveAt: { lte: now } }, orderBy: { effectiveAt: "asc" } });
    if (!pending) return;
    const claimed = await transaction.pendingTransition.updateMany({ where: { id: pending.id, status: "PENDING" }, data: { status: "APPLIED", appliedAt: now } });
    if (claimed.count !== 1) return;
    const session = await transaction.quizSession.findUnique({ where: { id: eventId } });
    if (!session || session.phase !== pending.fromPhase) return;
    await transaction.quizSession.update({
      where: { id: eventId },
      data: {
        phase: pending.toPhase,
        status: statusForPhase(pending.toPhase),
        currentQuestionIndex: pending.toQuestionIndex,
        currentRound: pending.toRound,
        registrationClosedAt: pending.toPhase === "QUESTION" && !session.registrationClosedAt ? now : session.registrationClosedAt,
        startedAt: pending.toPhase === "QUESTION" && !session.startedAt ? now : session.startedAt,
        finishedAt: pending.toPhase === "FINISHED" ? now : session.finishedAt,
        version: { increment: 1 },
      },
    });
    await transaction.auditEvent.create({ data: { actorId: null, action: "quiz.transition_applied", entityType: "QuizSession", entityId: eventId, afterJson: json({ transitionId: pending.id, phase: pending.toPhase, questionIndex: pending.toQuestionIndex, round: pending.toRound }) } });
  });
}

export async function scheduleTransition(input: {
  eventId: string;
  action: ControlAction;
  expectedVersion: number;
  requestId: string;
  actorId: string;
  now?: Date;
  delayMs?: number;
}): Promise<EventStateView> {
  const db = await getDb();
  const now = input.now ?? new Date();
  await db.$transaction(async (transaction) => {
    const existingRequest = await transaction.pendingTransition.findUnique({ where: { eventId_requestId: { eventId: input.eventId, requestId: input.requestId } } });
    if (existingRequest) return;
    const session = await transaction.quizSession.findUnique({ where: { id: input.eventId } });
    if (!session) throw new QuizValidationError("Quiz session not found");
    if (session.version !== input.expectedVersion) throw new QuizStateError("Quiz state version has changed");
    const existingPending = await transaction.pendingTransition.findFirst({ where: { eventId: input.eventId, status: "PENDING" } });
    if (existingPending) throw new QuizStateError("A transition is already pending");
    const target = getTransitionTarget({ phase: session.phase, questionIndex: session.currentQuestionIndex, round: session.currentRound }, input.action);
    await transaction.pendingTransition.create({ data: {
      id: crypto.randomUUID(), eventId: input.eventId, requestId: input.requestId,
      fromPhase: session.phase, toPhase: target.phase, fromQuestionIndex: session.currentQuestionIndex,
      toQuestionIndex: target.questionIndex, fromRound: session.currentRound, toRound: target.round,
      effectiveAt: new Date(now.getTime() + (input.delayMs ?? DEFAULT_TRANSITION_DELAY_MS)),
    } });
    await transaction.auditEvent.create({ data: { actorId: input.actorId, action: "quiz.transition_scheduled", entityType: "QuizSession", entityId: input.eventId, afterJson: json({ action: input.action, requestId: input.requestId, target }) } });
  });
  return getEventState(input.eventId, { kind: "admin", actorId: input.actorId });
}

export async function getEventState(eventId: string, actor: StateActor): Promise<EventStateView> {
  const db = await getDb();
  const now = new Date();
  await applyDueTransition(eventId, now);
  const session = await db.quizSession.findUnique({
    where: { id: eventId },
    include: {
      questions: { orderBy: { order: "asc" } },
      pendingTransitions: { where: { status: "PENDING" }, orderBy: { effectiveAt: "asc" }, take: 1 },
      resultRounds: { include: { winners: { orderBy: { ordinal: "asc" } } }, orderBy: { round: "asc" } },
    },
  });
  if (!session) throw new QuizValidationError("Quiz session not found");
  const participant = await participantForActor(eventId, actor, db);
  if (actor.kind === "participant" && !participant) throw new QuizParticipantError();
  const currentQuestion = session.currentQuestionIndex ? session.questions.find((question) => question.order === session.currentQuestionIndex) : null;
  const visibleResults = actor.kind === "admin" ? session.resultRounds : session.resultRounds.filter((round) => round.revealedAt && round.revealedAt <= now);
  const answers = participant ? await db.quizAnswer.findMany({ where: { participantId: participant.id }, orderBy: { submittedAt: "asc" } }) : [];
  return {
    eventId, phase: session.phase, version: session.version, questionIndex: session.currentQuestionIndex, round: session.currentRound,
    serverTime: now.toISOString(), pendingTransition: session.pendingTransitions[0] ? toPendingView(session.pendingTransitions[0]) : null,
    currentQuestion: actor.kind === "public"
      ? null
      : currentQuestion
        ? (actor.kind === "admin"
          ? questionForAdmin({ ...currentQuestion, timeLimitSeconds: currentQuestion.timeLimitSeconds ?? session.defaultTimeLimitSeconds })
          : redactQuestionForParticipant({ ...currentQuestion, timeLimitSeconds: currentQuestion.timeLimitSeconds ?? session.defaultTimeLimitSeconds }))
        : null,
    me: participant ? { participantId: participant.id, answeredQuestionIds: answers.map((answer) => answer.questionId), answers: answers.map((answer) => ({ questionId: answer.questionId, submissionId: answer.submissionId ?? answer.id, selectedOption: answer.selectedOption, accepted: !answer.isLate, isLate: answer.isLate, score: session.phase === "RESULTS" || session.phase === "FINISHED" ? answer.score : null, submittedAt: answer.submittedAt.toISOString() })), totalScore: session.phase === "RESULTS" || session.phase === "FINISHED" ? participant.totalScore : null } : null,
    results: actor.kind === "public" ? [] : visibleResults.map(resultRoundView),
  };
}

export async function getEventResults(eventId: string, actor: StateActor): Promise<QuizResultRoundView[]> {
  const state = await getEventState(eventId, actor);
  return state.results;
}
