import { describe, expect, it } from "vitest";

import {
  defaultGroupingRules,
  evaluateGrouping,
} from "@/modules/grouping";

describe("grouping evaluation", () => {
  it("uses the highest-priority matching primary group", async () => {
    const result = await evaluateGrouping(
      {
        childCount: 1,
        isOutOfTown: true,
        relation: "GROOM_FRIEND",
      },
      defaultGroupingRules,
    );

    expect(result.primaryGroupKey).toBe("family-with-children");
    expect(result.ruleId).toBe("primary-with-children");
  });

  it("keeps independent tags when a higher-priority group wins", async () => {
    const result = await evaluateGrouping(
      {
        childCount: 1,
        isOutOfTown: true,
        relation: "GROOM_RELATIVE",
      },
      defaultGroupingRules,
    );

    expect(result.tags).toEqual(
      expect.arrayContaining(["with-children", "out-of-town", "groom-side"]),
    );
  });

  it("returns an ungrouped result when no primary rule matches", async () => {
    const result = await evaluateGrouping(
      { childCount: 0, isOutOfTown: false, relation: "OTHER" },
      defaultGroupingRules.filter((rule) => rule.kind === "TAG"),
    );

    expect(result.primaryGroupKey).toBeNull();
    expect(result.ruleId).toBeNull();
  });
});
