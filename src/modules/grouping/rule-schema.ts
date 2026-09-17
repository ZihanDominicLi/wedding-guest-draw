import { z } from "zod";

const leafConditionSchema = z.object({
  fact: z.string().min(1),
  operator: z.enum([
    "equal",
    "notEqual",
    "in",
    "notIn",
    "lessThan",
    "lessThanInclusive",
    "greaterThan",
    "greaterThanInclusive",
    "contains",
    "doesNotContain",
  ]),
  value: z.unknown(),
  path: z.string().optional(),
});

type ConditionNode =
  | z.infer<typeof leafConditionSchema>
  | { all: ConditionNode[] }
  | { any: ConditionNode[] }
  | { not: ConditionNode };

const conditionNodeSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([
    leafConditionSchema,
    z.object({ all: z.array(conditionNodeSchema).min(1) }),
    z.object({ any: z.array(conditionNodeSchema).min(1) }),
    z.object({ not: conditionNodeSchema }),
  ]),
);

export const topLevelConditionSchema = z.union([
  z.object({ all: z.array(conditionNodeSchema).min(1) }),
  z.object({ any: z.array(conditionNodeSchema).min(1) }),
  z.object({ not: conditionNodeSchema }),
]);

export const groupingRuleSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: z.enum(["PRIMARY", "TAG"]),
    enabled: z.boolean(),
    priority: z.number().int(),
    conditions: topLevelConditionSchema,
    targetGroupKey: z.string().min(1).nullable().optional(),
    targetTagKey: z.string().min(1).nullable().optional(),
  })
  .superRefine((rule, context) => {
    if (rule.kind === "PRIMARY" && !rule.targetGroupKey) {
      context.addIssue({
        code: "custom",
        message: "Primary rules require a target group",
        path: ["targetGroupKey"],
      });
    }
    if (rule.kind === "TAG" && !rule.targetTagKey) {
      context.addIssue({
        code: "custom",
        message: "Tag rules require a target tag",
        path: ["targetTagKey"],
      });
    }
  });

export type GroupingRule = z.infer<typeof groupingRuleSchema>;
