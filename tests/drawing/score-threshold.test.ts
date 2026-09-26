import { describe, expect, it } from "vitest";

import { resolveScoreThreshold } from "@/modules/drawing/score-threshold";

describe("resolveScoreThreshold", () => {
  it("uses the quiz maximum when the automatic mode omits a starting threshold", () => {
    expect(resolveScoreThreshold([10, 8, 7], undefined, 2)).toEqual({ actualThreshold: 8, fallbackCount: 2, eligibleCount: 2 });
  });

  it("keeps the configured threshold when enough guests qualify", () => {
    expect(resolveScoreThreshold([10, 9, 8, 6], 8, 2)).toEqual({ actualThreshold: 8, fallbackCount: 0, eligibleCount: 3 });
  });

  it("lowers one point at a time until the prize quota is covered", () => {
    expect(resolveScoreThreshold([10, 8, 6, 5], 10, 3)).toEqual({ actualThreshold: 6, fallbackCount: 4, eligibleCount: 3 });
  });

  it("stops at zero and reports a shortage when the group is too small", () => {
    expect(resolveScoreThreshold([4, 2], 10, 3)).toEqual({ actualThreshold: 0, fallbackCount: 10, eligibleCount: 2 });
  });
});
