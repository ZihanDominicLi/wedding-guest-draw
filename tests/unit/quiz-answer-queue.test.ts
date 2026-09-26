import { beforeEach, describe, expect, it } from "vitest";

import {
  clearAnswerQueueForTests,
  enqueueAnswer,
  flushAnswerQueue,
  listPendingAnswers,
} from "@/modules/quiz/answer-queue";

describe("quiz answer queue", () => {
  beforeEach(async () => {
    await clearAnswerQueueForTests();
  });

  it("persists pending answers and removes them after the server confirms", async () => {
    await enqueueAnswer({
      eventId: "event-a",
      participantId: "participant-a",
      questionId: "question-a",
      submissionId: "submission-a",
      optionIndex: 2,
    });

    expect((await listPendingAnswers()).map((item) => item.submissionId)).toEqual(["submission-a"]);
    const result = await flushAnswerQueue(async () => undefined);
    expect(result).toEqual({ sent: 1, removed: 1, failed: 0 });
    expect(await listPendingAnswers()).toEqual([]);
  });

  it("keeps failed answers for retry and increments retry count", async () => {
    await enqueueAnswer({
      eventId: "event-a",
      participantId: "participant-a",
      questionId: "question-a",
      submissionId: "submission-a",
      optionIndex: 0,
    });

    const result = await flushAnswerQueue(async () => { throw new Error("offline"); });
    expect(result).toEqual({ sent: 0, removed: 0, failed: 1 });
    expect((await listPendingAnswers())[0]?.retryCount).toBe(1);
  });

  it("isolates records by event, participant and question", async () => {
    await enqueueAnswer({ eventId: "event-a", participantId: "participant-a", questionId: "question-a", submissionId: "submission-a", optionIndex: 0 });
    await enqueueAnswer({ eventId: "event-b", participantId: "participant-a", questionId: "question-a", submissionId: "submission-b", optionIndex: 1 });
    await enqueueAnswer({ eventId: "event-a", participantId: "participant-b", questionId: "question-a", submissionId: "submission-c", optionIndex: 2 });

    const result = await flushAnswerQueue(async (item) => {
      if (item.eventId === "event-a" && item.participantId === "participant-a") return;
      throw new Error("different identity must remain queued");
    });
    expect(result).toEqual({ sent: 1, removed: 1, failed: 2 });
    expect((await listPendingAnswers()).map((item) => item.submissionId)).toEqual(["submission-b", "submission-c"]);
  });

  it("does not send the same answer twice when flushes overlap", async () => {
    await enqueueAnswer({ eventId: "event-a", participantId: "participant-a", questionId: "question-a", submissionId: "submission-a", optionIndex: 1 });
    let calls = 0;
    const send = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
    };

    const results = await Promise.all([flushAnswerQueue(send), flushAnswerQueue(send)]);

    expect(calls).toBe(1);
    expect(results[0]).toEqual({ sent: 1, removed: 1, failed: 0 });
    expect(results[1]).toEqual(results[0]);
  });

  it("flushes only the active participant's answers when a scope is supplied", async () => {
    await enqueueAnswer({ eventId: "event-a", participantId: "participant-a", questionId: "question-a", submissionId: "submission-a", optionIndex: 0 });
    await enqueueAnswer({ eventId: "event-a", participantId: "participant-b", questionId: "question-a", submissionId: "submission-b", optionIndex: 1 });

    const result = await flushAnswerQueue(async () => undefined, { eventId: "event-a", participantId: "participant-a" });

    expect(result).toEqual({ sent: 1, removed: 1, failed: 0 });
    expect((await listPendingAnswers()).map((answer) => answer.submissionId)).toEqual(["submission-b"]);
  });
});
