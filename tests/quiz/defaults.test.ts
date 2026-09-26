import { describe, expect, it } from "vitest";

import { defaultQuizQuestions } from "@/modules/quiz/defaults";

describe("default wedding quiz", () => {
  it("provides the agreed ten-question draft without answer keys", () => {
    expect(defaultQuizQuestions).toHaveLength(10);
    expect(defaultQuizQuestions[0]).toMatchObject({
      prompt: "新娘的名字是？",
      options: ["邓廷月", "邓婷月", "邓婷日", "邓月"],
      correctOption: null,
    });
    expect(defaultQuizQuestions[7]).toMatchObject({
      prompt: "新娘新郎养的两只猫叫什么名字？",
      options: ["来福和lucky", "莱福和lucky", "来福和luckin", "莱福和luckin"],
      correctOption: null,
    });
    expect(defaultQuizQuestions[8]).toMatchObject({
      prompt: "新娘和新郎的生日分别在几月份？",
      options: ["3月和5月", "3月和7月", "3月和12月", "都在3月"],
      correctOption: null,
    });
    expect(defaultQuizQuestions[9]).toMatchObject({
      prompt: "新娘和新郎的恋爱纪念日是？",
      options: ["7月1日", "8月1日", "9月1日", "10月1日"],
      correctOption: null,
    });
    expect(defaultQuizQuestions.every((question) => question.correctOption === null)).toBe(true);
  });
});
