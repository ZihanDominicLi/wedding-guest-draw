import { Engine, type TopLevelCondition } from "json-rules-engine";

import { groupingRuleSchema, type GroupingRule } from "./rule-schema";

export type GroupingFacts = {
  childCount: number;
  isOutOfTown: boolean;
  relation: string;
};

export type GroupingResult = {
  primaryGroupKey: string | null;
  tags: string[];
  ruleId: string | null;
};

export async function evaluateGrouping(
  facts: GroupingFacts,
  rawRules: readonly GroupingRule[],
): Promise<GroupingResult> {
  const rules = rawRules
    .map((rule) => groupingRuleSchema.parse(rule))
    .filter((rule) => rule.enabled)
    .sort((left, right) => right.priority - left.priority);
  const engine = new Engine([], { allowUndefinedFacts: false });

  for (const rule of rules) {
    engine.addRule({
      name: rule.id,
      priority: rule.priority,
      conditions: rule.conditions as TopLevelCondition,
      event: {
        type: rule.kind === "PRIMARY" ? "primary-group" : "tag",
        params: { ruleId: rule.id },
      },
    });
  }

  const { events } = await engine.run(facts);
  const matchedIds = new Set(
    events
      .map((event) => event.params?.ruleId)
      .filter((ruleId): ruleId is string => typeof ruleId === "string"),
  );
  const matchedRules = rules.filter((rule) => matchedIds.has(rule.id));
  const primaryRule = matchedRules.find((rule) => rule.kind === "PRIMARY");
  const tags = matchedRules
    .filter((rule) => rule.kind === "TAG" && rule.targetTagKey)
    .map((rule) => rule.targetTagKey as string);

  return {
    primaryGroupKey: primaryRule?.targetGroupKey ?? null,
    tags: [...new Set(tags)],
    ruleId: primaryRule?.id ?? null,
  };
}
