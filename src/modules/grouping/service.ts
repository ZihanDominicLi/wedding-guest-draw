import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";
import { groupingRuleSchema, type GroupingRule } from "./rule-schema";

type RuleClient = PrismaClient | Prisma.TransactionClient;

export async function loadActiveGroupingRules(
  client: RuleClient = db,
): Promise<GroupingRule[]> {
  const storedRules = await client.groupingRule.findMany({
    where: { enabled: true },
    include: { targetGroup: true, targetTag: true },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  return storedRules.map((rule) =>
    groupingRuleSchema.parse({
      id: rule.id,
      name: rule.name,
      kind: rule.kind,
      enabled: rule.enabled,
      priority: rule.priority,
      conditions: rule.conditions,
      targetGroupKey: rule.targetGroup?.key ?? null,
      targetTagKey: rule.targetTag?.key ?? null,
    }),
  );
}
