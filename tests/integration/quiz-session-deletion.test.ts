import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { deleteQuizSession } from "@/modules/quiz/service";
import { QuizStateError } from "@/modules/quiz/types";

const marker = "答题场次删除测试";
let sessionIds: string[] = [];
let guestIds: string[] = [];

async function cleanup() {
  if (sessionIds.length) {
    await db.auditEvent.deleteMany({ where: { entityType: "QuizSession", entityId: { in: sessionIds } } });
    await db.quizSession.deleteMany({ where: { id: { in: sessionIds } } });
  }
  if (guestIds.length) await db.guest.deleteMany({ where: { id: { in: guestIds } } });
  sessionIds = [];
  guestIds = [];
}

describe("deleteQuizSession", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("clears guest quiz results, cascades answers, and records an audit event", async () => {
    const actor = await db.adminUser.findFirstOrThrow();
    const session = await db.quizSession.create({
      data: {
        title: marker,
        questionCount: 1,
        questions: { create: { order: 1, prompt: "测试题", options: ["A", "B"], correctOption: 0 } },
      },
    });
    sessionIds.push(session.id);
    const question = await db.quizQuestion.findFirstOrThrow({ where: { sessionId: session.id } });
    const guest = await db.guest.create({
      data: {
        name: marker,
        normalizedName: marker,
        phoneLast4: "9090",
        relation: "OTHER",
        childCount: 0,
        originProvince: "北京",
        originCity: "北京市",
        isOutOfTown: false,
        quizSessionId: session.id,
        quizScore: 1,
        quizCompletedAt: new Date(),
      },
    });
    guestIds.push(guest.id);
    const participant = await db.quizParticipant.create({
      data: { sessionId: session.id, guestId: guest.id, tokenHash: `${marker}-token` },
    });
    await db.quizAnswer.create({
      data: { participantId: participant.id, questionId: question.id, selectedOption: 0, isCorrect: true, score: 1 },
    });

    await deleteQuizSession(session.id, actor.id);

    await expect(db.quizSession.findUnique({ where: { id: session.id } })).resolves.toBeNull();
    await expect(db.quizAnswer.count({ where: { participantId: participant.id } })).resolves.toBe(0);
    await expect(db.guest.findUnique({ where: { id: guest.id }, select: { quizSessionId: true, quizScore: true, quizCompletedAt: true } })).resolves.toMatchObject({ quizSessionId: null, quizScore: null, quizCompletedAt: null });
    await expect(db.auditEvent.findFirst({ where: { action: "quiz.session_deleted", entityId: session.id } })).resolves.toMatchObject({ actorId: actor.id });
  });

  it("rejects deletion while a session is live", async () => {
    const actor = await db.adminUser.findFirstOrThrow();
    const session = await db.quizSession.create({ data: { title: `${marker}-live`, status: "LIVE", questionCount: 1 } });
    sessionIds.push(session.id);

    await expect(deleteQuizSession(session.id, actor.id)).rejects.toBeInstanceOf(QuizStateError);
    await expect(db.quizSession.findUnique({ where: { id: session.id } })).resolves.not.toBeNull();
  });
});
