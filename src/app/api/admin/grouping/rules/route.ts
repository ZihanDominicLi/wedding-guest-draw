import type { Prisma } from "@prisma/client";
import { ZodError, z } from "zod";

import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, problem } from "@/lib/http";
import { topLevelConditionSchema } from "@/modules/grouping";

const ruleInputSchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["PRIMARY", "TAG"]),
  enabled: z.boolean(),
  priority: z.number().int(),
  conditions: topLevelConditionSchema,
  targetGroupKey: z.string().nullable(),
  targetTagKey: z.string().nullable(),
});

export async function PUT(request: Request) {
  try {
    const administrator = await requireAdmin(request.headers);
    const { rules } = z.object({ rules: z.array(ruleInputSchema).min(1) }).parse(await request.json());
    const version = await db.$transaction(async (transaction) => {
      const latest = await transaction.groupingRule.aggregate({ _max: { version: true } });
      const nextVersion = (latest._max.version ?? 0) + 1;
      const [groups, tags] = await Promise.all([
        transaction.group.findMany(),
        transaction.tag.findMany(),
      ]);
      const groupByKey = new Map(groups.map((group) => [group.key, group.id]));
      const tagByKey = new Map(tags.map((tag) => [tag.key, tag.id]));
      for (const rule of rules) {
        await transaction.groupingRule.create({
          data: {
            name: rule.name,
            kind: rule.kind,
            enabled: rule.enabled,
            priority: rule.priority,
            conditions: rule.conditions as Prisma.InputJsonValue,
            version: nextVersion,
            targetGroupId: rule.targetGroupKey ? groupByKey.get(rule.targetGroupKey) : null,
            targetTagId: rule.targetTagKey ? tagByKey.get(rule.targetTagKey) : null,
            createdById: administrator.id,
          },
        });
      }
      await transaction.auditEvent.create({
        data: {
          actorId: administrator.id,
          action: "grouping.rules_saved",
          entityType: "GroupingRuleSet",
          entityId: String(nextVersion),
          afterJson: { version: nextVersion, ruleCount: rules.length },
        },
      });
      return nextVersion;
    });
    return ok({ version });
  } catch (error) {
    if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
    if (error instanceof ZodError) return problem(422, "INVALID_RULES", "规则配置无效");
    throw error;
  }
}
