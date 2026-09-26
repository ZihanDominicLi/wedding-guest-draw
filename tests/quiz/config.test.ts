import { describe, expect, it } from "vitest";

import { validateQuizDefinition, validateQuizForPublish } from "@/modules/quiz/config";

const questions = Array.from({ length: 7 }, (_, index) => ({
  prompt: `题目 ${index + 1}`,
  options: ["A", "B", "C", "D"],
  correctOption: null,
}));

describe("quiz definition validation", () => {
  it("accepts a seven-question draft without configured answers", () => {
    expect(validateQuizDefinition(questions)).toEqual([]);
  });

  it("requires every answer before publishing", () => {
    expect(() => validateQuizForPublish(questions)).toThrow("第 1 题还没有设置正确答案");
  });

  it("accepts a complete seven-question quiz for publishing", () => {
    expect(() => validateQuizForPublish(questions.map((question) => ({ ...question, correctOption: 1 })))).not.toThrow();
  });
});
