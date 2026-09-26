import { describe, expect, it } from "vitest";

import { createQuestionWindow, effectiveQuestionCloseAt, isWithinAnswerWindow } from "@/modules/quiz/answer-window";

describe("quiz answer window", () => {
  const opensAt = new Date("2026-09-27T10:00:00.000Z");
  const closesAt = new Date("2026-09-27T10:00:30.000Z");

  it("accepts answers at both server-defined boundaries", () => {
    expect(isWithinAnswerWindow(opensAt, closesAt, opensAt)).toBe(true);
    expect(isWithinAnswerWindow(opensAt, closesAt, closesAt)).toBe(true);
  });

  it("rejects answers before opening, after closing, or without a complete window", () => {
    expect(isWithinAnswerWindow(opensAt, closesAt, new Date(opensAt.getTime() - 1))).toBe(false);
    expect(isWithinAnswerWindow(opensAt, closesAt, new Date(closesAt.getTime() + 1))).toBe(false);
    expect(isWithinAnswerWindow(null, closesAt, opensAt)).toBe(false);
    expect(isWithinAnswerWindow(opensAt, null, opensAt)).toBe(false);
  });

  it("caps the answer window at an earlier scheduled transition", () => {
    const transitionAt = new Date("2026-09-27T10:00:12.000Z");

    expect(isWithinAnswerWindow(opensAt, closesAt, transitionAt, transitionAt)).toBe(true);
    expect(isWithinAnswerWindow(opensAt, closesAt, new Date(transitionAt.getTime() + 1), transitionAt)).toBe(false);
  });

  it("uses the earlier of the persisted close and scheduled transition", () => {
    const transitionAt = new Date("2026-09-27T10:00:12.000Z");
    expect(effectiveQuestionCloseAt(closesAt, transitionAt)).toEqual(transitionAt);
    expect(effectiveQuestionCloseAt(closesAt, new Date("2026-09-27T10:00:40.000Z"))).toEqual(closesAt);
    expect(effectiveQuestionCloseAt(null, transitionAt)).toEqual(transitionAt);
    expect(effectiveQuestionCloseAt(closesAt, null)).toEqual(closesAt);
  });

  it("anchors a question's open and close times to its scheduled effective time", () => {
    expect(createQuestionWindow(opensAt, 30)).toEqual({
      opensAt,
      closesAt: new Date("2026-09-27T10:00:30.000Z"),
    });
  });
});
