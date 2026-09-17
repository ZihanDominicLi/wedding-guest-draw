import { describe, expect, it } from "vitest";

import { sampleWithoutReplacement } from "@/modules/drawing/random";

describe("sampleWithoutReplacement", () => {
  it("selects deterministic unique values without mutating the input", () => {
    const candidates = ["甲", "乙", "丙", "丁"] as const;
    const original = [...candidates];
    const choices = [2, 0];

    const result = sampleWithoutReplacement(
      candidates,
      2,
      (upperExclusive) => {
        const choice = choices.shift() ?? 0;
        expect(choice).toBeLessThan(upperExclusive);
        return choice;
      },
    );

    expect(result).toEqual(["丙", "乙"]);
    expect(new Set(result).size).toBe(2);
    expect(candidates).toEqual(original);
  });

  it("accepts zero and the full candidate count", () => {
    expect(sampleWithoutReplacement([1, 2], 0, () => 0)).toEqual([]);
    expect(sampleWithoutReplacement([1, 2], 2, () => 0)).toEqual([1, 2]);
  });

  it("rejects invalid requested counts", () => {
    expect(() => sampleWithoutReplacement([1], 2, () => 0)).toThrow(/candidate/i);
    expect(() => sampleWithoutReplacement([1], -1, () => 0)).toThrow(/count/i);
    expect(() => sampleWithoutReplacement([1], 0.5, () => 0)).toThrow(/count/i);
  });

  it("rejects random values outside the requested range", () => {
    expect(() => sampleWithoutReplacement([1, 2], 1, () => 2)).toThrow(/random/i);
  });
});
