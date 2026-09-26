// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuizParticipant } from "@/components/quiz/QuizParticipant";
import { clearAnswerQueueForTests, enqueueAnswer } from "@/modules/quiz/answer-queue";

const state = {
  eventId: "event-1",
  phase: "QUESTION",
  version: 1,
  questionIndex: 1,
  round: null,
  serverTime: "2026-09-27T00:00:00.000Z",
  pendingTransition: null,
  currentQuestion: {
    id: "question-1",
    order: 1,
    prompt: "新郎的名字是？",
    options: ["甲", "乙", "丙", "丁"],
    timeLimitSeconds: 30,
    opensAt: null,
    closesAt: null,
    publishedAt: null,
  },
  me: {
    participantId: "participant-1",
    answeredQuestionIds: [],
    answers: [],
    totalScore: null,
  },
  results: [],
};

describe("quiz participant answer submission", () => {
  beforeEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await clearAnswerQueueForTests();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ data: {
          submissionId: "submission-1",
          questionId: "question-1",
          accepted: true,
          selectedOption: 2,
          isLate: false,
          score: 1,
          submittedAt: "2026-09-27T00:00:01.000Z",
        } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      expect(url).toBe("/api/events/event-1/state");
      return new Response(JSON.stringify({ data: state }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    vi.stubGlobal("crypto", { randomUUID: () => "submission-1" });
  });

  it("saves immediately when an option is selected and locks it after confirmation", async () => {
    const view = render(<QuizParticipant sessionId="event-1" title="现场答题" />);

    await waitFor(() => expect((view.getByRole("button", { name: "丙" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(view.getByRole("button", { name: "丙" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/events/event-1/answers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ questionId: "question-1", optionIndex: 2, submissionId: "submission-1" }),
      }),
    ));
    await waitFor(() => expect(view.getByRole("status").textContent).toContain("已保存"));
    expect((view.getByRole("button", { name: "丙" }) as HTMLButtonElement).disabled).toBe(true);
    expect(view.queryByRole("button", { name: "提交答案" })).toBeNull();
  });

  it("restores a pending selection and retries it immediately after reload", async () => {
    await enqueueAnswer({
      eventId: "event-1",
      participantId: "participant-1",
      questionId: "question-1",
      submissionId: "submission-1",
      optionIndex: 2,
    });

    const view = render(<QuizParticipant sessionId="event-1" title="现场答题" />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/events/event-1/answers",
      expect.objectContaining({ method: "POST" }),
    ));
    expect((view.getByRole("button", { name: "丙" }) as HTMLButtonElement).disabled).toBe(true);
    expect(view.getByRole("status").textContent).toContain("保存");
  });

  it("flushes a queued answer when the guest returns to the foreground", async () => {
    const view = render(<QuizParticipant sessionId="event-1" title="现场答题" />);
    await waitFor(() => expect(view.getByRole("button", { name: "丙" })).toBeTruthy());

    await enqueueAnswer({
      eventId: "event-1",
      participantId: "participant-1",
      questionId: "question-1",
      submissionId: "foreground-submission",
      optionIndex: 1,
    });
    const callsBeforeVisibility = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBeforeVisibility));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/events/event-1/answers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ questionId: "question-1", optionIndex: 1, submissionId: "foreground-submission" }),
      }),
    ));
    view.unmount();
  });
});
