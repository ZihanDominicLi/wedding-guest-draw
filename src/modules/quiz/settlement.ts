import { Prisma, type PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";
import { withTransactionIdempotency } from "@/lib/idempotency";
import { applyDueTransition } from "./transition";
import { buildFrozenResults, scoreAnswers, type SettledParticipant } from "./results";
import { QuizStateError, QuizValidationError } from "./types";

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function resultView(round: {
  id: string; round: number; type: "ELDER_TOP" | "FRIEND_TOP" | "ELDER_RANDOM" | "FRIEND_RANDOM" | "WITH_CHILD_RANDOM";
  requestedCount: number; eligibleCount: number; actualCount: number; shortage: number; actualThreshold: number | null;
  winners: Array<{ id: string; ordinal: number; participantId: string; displayNameSnapshot: string; scoreSnapshot: number | null }>;
}) {
  return {
    id: round.id,
    round: round.round,
    type: round.type,
    requestedCount: round.requestedCount,
    eligibleCount: round.eligibleCount,
    actualCount: round.actualCount,
    shortage: round.shortage,
    actualThreshold: round.actualThreshold,
    winners: round.winners.map((winner) => ({ id: winner.id, round: round.round, ordinal: winner.ordinal, participantId: winner.participantId, displayName: winner.displayNameSnapshot, score: winner.scoreSnapshot })),
  };
}

async function existingSettlement(transaction: Transaction, eventId: string) {
  const rounds = await transaction.quizResultRound.findMany({ where: { eventId }, include: { winners: { orderBy: { ordinal: "asc" } } }, orderBy: { round: "asc" } });
  return rounds.map(resultView);
}

export async function settleEvent(eventId: string, actorId: string, requestId: string) {
  await applyDueTransition(eventId);
  return db.$transaction(async (transaction) => withTransactionIdempotency(transaction, `quiz:settle:${eventId}`, requestId, async () => {
    const session = await transaction.quizSession.findUnique({ where: { id: eventId }, include: { questions: { orderBy: { order: "asc" } } } });
    if (!session) throw new QuizValidationError("Quiz session not found");
    const alreadySettled = await existingSettlement(transaction, eventId);
    if (alreadySettled.length === 5 && session.settledAt) return { eventId, phase: session.phase, rounds: alreadySettled };
    if (!["SETTLING", "QUESTION"].includes(session.phase)) throw new QuizStateError(`Quiz session is ${session.phase}`);
    const participants = await transaction.quizParticipant.findMany({ where: { sessionId: eventId }, include: { guest: { select: { name: true, phoneLast4: true } }, answers: { select: { questionId: true, isCorrect: true, selectedOption: true } } } });
    const settled: SettledParticipant[] = participants.map((participant) => {
      const score = scoreAnswers(session.questions.map((question) => {
        const answer = participant.answers.find((item) => item.selectedOption !== null && item.isCorrect !== null && item.selectedOption !== undefined && question.id === item.questionId);
        return answer ? answer.isCorrect : null;
      }));
      return { id: participant.id, displayName: `${participant.guest.name}（${participant.guest.phoneLast4}）`, group: participant.participantGroup, hasChildren: participant.hasChildren, ...score };
    });
    const frozen = buildFrozenResults(settled, session.scoringRuleVersion);
    const settledAt = new Date();
    for (const participant of settled) {
      await transaction.quizParticipant.update({ where: { id: participant.id }, data: { totalScore: participant.totalScore, score: participant.totalScore, answeredCount: participant.answeredCount, settledAt } });
      const source = participants.find((item) => item.id === participant.id)!;
      await transaction.guest.update({ where: { id: source.guestId }, data: { quizScore: participant.totalScore, quizCompletedAt: settledAt, quizSessionId: eventId } });
    }
    for (const round of frozen) {
      const createdRound = await transaction.quizResultRound.create({ data: {
        id: round.id, eventId, round: round.round, type: round.type, requestedCount: round.requestedCount,
        eligibleCount: round.eligibleCount, actualCount: round.actualCount, shortage: round.shortage,
        actualThreshold: round.actualThreshold, ruleVersion: round.ruleVersion,
        candidateSnapshot: json(round.candidateSnapshot), sameScoreOrder: json(round.sameScoreOrder),
        winners: { create: round.winners.map((winner) => ({ id: winner.id, eventId, participantId: winner.participantId, ordinal: winner.ordinal, displayNameSnapshot: winner.displayName, scoreSnapshot: winner.score, candidateSnapshot: json(round.candidateSnapshot.find((candidate) => candidate.participantId === winner.participantId) ?? {}) })) },
      }, include: { winners: { orderBy: { ordinal: "asc" } } } });
      void createdRound;
    }
    await transaction.quizSession.update({ where: { id: eventId }, data: { phase: "QUIZ_ENDED", status: "REVIEW", settledAt, version: { increment: 1 } } });
    await transaction.auditEvent.create({ data: { actorId, action: "quiz.settled", entityType: "QuizSession", entityId: eventId, afterJson: json({ participantCount: settled.length, roundCount: frozen.length }) } });
    return { eventId, phase: "QUIZ_ENDED" as const, rounds: frozen.map((round) => ({ ...round, winners: round.winners })) };
  }, { serialize: (value) => value }));
}
