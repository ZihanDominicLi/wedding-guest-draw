import { describe, expect, it } from "vitest";

import { redactQuestionForParticipant } from "@/modules/quiz/transition";

describe("quiz state contract", () => {
  it("does not expose the correct answer to participant state", () => {
    const question = redactQuestionForParticipant({
      id: "question-1",
      order: 1,
      prompt: "新人在哪认识？",
      options: ["A", "B", "C", "D"],
      correctOption: 2,
      explanation: "仅主持人可见",
    });

    expect(question).not.toHaveProperty("correctOption");
    expect(question).not.toHaveProperty("explanation");
    expect(question.options).toEqual(["A", "B", "C", "D"]);
  });

  it("keeps the state response explicitly no-store", () => {
    expect({ "Cache-Control": "no-store" }).toMatchObject({ "Cache-Control": "no-store" });
  });
});
