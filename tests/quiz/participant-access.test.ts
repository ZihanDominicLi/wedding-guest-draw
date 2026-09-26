import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    quizParticipant: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    guest: { findFirst: vi.fn() },
    quizSession: { findUnique: vi.fn() },
    quizAnswer: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db }));

import { getParticipantQuizState } from "@/modules/quiz/service";
import { hashParticipantToken } from "@/modules/quiz/participant-token";
import { QuizParticipantError } from "@/modules/quiz/types";

const token = "registration-cookie-token";
const participant = {
  id: "participant-1",
  sessionId: "session-1",
  guestId: "guest-1",
  tokenHash: hashParticipantToken(token),
  status: "ACTIVE",
  score: 0,
  completedAt: null,
  session: { id: "session-1" },
};

describe("quiz participant access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.quizParticipant.findFirst.mockResolvedValue(null);
    db.guest.findFirst.mockResolvedValue({ id: "guest-1" });
    db.quizParticipant.upsert.mockResolvedValue(participant);
    db.quizSession.findUnique.mockResolvedValue({
      id: "session-1",
      title: "新建的答题场次",
      status: "READY",
      questionCount: 1,
      defaultTimeLimitSeconds: 30,
      currentQuestionIndex: null,
      startedAt: null,
      finishedAt: null,
      questions: [],
    });
    db.quizAnswer.findUnique.mockResolvedValue(null);
  });

  it("creates a participant from a guest registration token for a later quiz session", async () => {
    const state = await getParticipantQuizState("session-1", token);

    expect(db.quizParticipant.upsert).toHaveBeenCalledWith({
      where: { sessionId_guestId: { sessionId: "session-1", guestId: "guest-1" } },
      create: {
        sessionId: "session-1",
        guestId: "guest-1",
        tokenHash: hashParticipantToken(token),
      },
      update: { tokenHash: hashParticipantToken(token) },
      include: { session: true },
    });
    expect(state.participant.guestId).toBe("guest-1");
  });

  it("rejects a token that belongs to no registered guest", async () => {
    db.guest.findFirst.mockResolvedValue(null);

    await expect(getParticipantQuizState("session-1", token)).rejects.toBeInstanceOf(
      QuizParticipantError,
    );
    expect(db.quizParticipant.upsert).not.toHaveBeenCalled();
  });
});
