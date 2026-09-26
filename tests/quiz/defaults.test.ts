import { describe, expect, it } from "vitest";

import { defaultQuizQuestions } from "@/modules/quiz/defaults";

describe("default wedding quiz", () => {
  it("provides the agreed seven-question draft without answer keys", () => {
    expect(defaultQuizQuestions).toHaveLength(7);
    expect(defaultQuizQuestions[0]).toMatchObject({
      prompt: "新娘的名字是？",
      options: ["邓廷月", "邓婷月", "邓婷日", "邓月"],
      correctOption: null,
    });
    expect(defaultQuizQuestions.every((question) => question.correctOption === null)).toBe(true);
  });
});
