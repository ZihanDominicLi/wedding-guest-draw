import { describe, expect, it } from "vitest";

import { mergeQuizSessionStats } from "@/modules/quiz/admin-state";

describe("mergeQuizSessionStats", () => {
  it("updates the matching session without replacing its questions or controls", () => {
    const sessions = [{
      id: "session-1",
      title: "现场答题",
      status: "LIVE",
      participantCount: 2,
      submittedCount: 1,
      skippedCount: 0,
      completedCount: 0,
      averageScore: 1,
      currentQuestionIndex: 1,
      defaultTimeLimitSeconds: 30,
      questions: [{ id: "question-1", order: 1 }],
    }];

    expect(mergeQuizSessionStats(sessions, [{
      id: "session-1",
      participantCount: 5,
      submittedCount: 4,
      skippedCount: 1,
      completedCount: 2,
      averageScore: 6.5,
    }])).toEqual([{ ...sessions[0], participantCount: 5, submittedCount: 4, skippedCount: 1, completedCount: 2, averageScore: 6.5 }]);
  });

  it("leaves sessions without a matching stats record unchanged", () => {
    const sessions = [{ id: "session-1", status: "READY" }, { id: "session-2", status: "DRAFT" }];

    expect(mergeQuizSessionStats(sessions, [{
      id: "session-1",
      participantCount: 1,
      submittedCount: 0,
      skippedCount: 0,
      completedCount: 0,
      averageScore: 0,
    }])).toEqual([{ id: "session-1", status: "READY", participantCount: 1, submittedCount: 0, skippedCount: 0, completedCount: 0, averageScore: 0 }, sessions[1]]);
  });
});
