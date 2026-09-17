import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";
import { evaluateGrouping } from "./engine";
import { groupingRuleSchema, type GroupingRule } from "./rule-schema";

type RuleClient = PrismaClient | Prisma.TransactionClient;

export async function loadActiveGroupingRules(
  client: RuleClient = db,
  version?: number,
): Promise<GroupingRule[]> {
  const storedRules = await client.groupingRule.findMany({
    where: { enabled: true, ...(version === undefined ? {} : { version }) },
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

export type GroupChangePreview = {
  ruleSetId: string;
  beforeCounts: Record<string, number>;
  afterCounts: Record<string, number>;
  changes: Array<{
    guestId: string;
    displayName: string;
    fromGroupKey: string | null;
    toGroupKey: string | null;
  }>;
};

function parseRuleSetId(ruleSetId: string): number {
  const version = Number(ruleSetId);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("Invalid grouping rule set");
  }
  return version;
}

function countGroups(keys: Array<string | null>): Record<string, number> {
  return keys.reduce<Record<string, number>>((counts, key) => {
    const countKey = key ?? "ungrouped";
    counts[countKey] = (counts[countKey] ?? 0) + 1;
    return counts;
  }, {});
}

export async function previewRecalculation(
  ruleSetId: string,
): Promise<GroupChangePreview> {
  const version = parseRuleSetId(ruleSetId);
  const [rules, guests] = await Promise.all([
    loadActiveGroupingRules(db, version),
    db.guest.findMany({
      where: { enabled: true, groupLocked: false },
      include: { primaryGroup: true },
      orderBy: { attendanceNumber: "asc" },
    }),
  ]);
  const evaluations = await Promise.all(
    guests.map(async (guest) => ({
      guest,
      result: await evaluateGrouping(
        {
          childCount: guest.childCount,
          isOutOfTown: guest.isOutOfTown,
          relation: guest.relation,
        },
        rules,
      ),
    })),
  );
  const changes = evaluations
    .filter(({ guest, result }) => guest.primaryGroup?.key !== result.primaryGroupKey)
    .map(({ guest, result }) => ({
      guestId: guest.id,
      displayName: guest.name,
      fromGroupKey: guest.primaryGroup?.key ?? null,
      toGroupKey: result.primaryGroupKey,
    }));

  return {
    ruleSetId,
    beforeCounts: countGroups(guests.map((guest) => guest.primaryGroup?.key ?? null)),
    afterCounts: countGroups(
      evaluations.map(({ result }) => result.primaryGroupKey),
    ),
    changes,
  };
}

export async function applyRecalculation(ruleSetId: string, actorId: string) {
  const version = parseRuleSetId(ruleSetId);

  return db.$transaction(
    async (transaction) => {
      const [rules, guests, groups, tags] = await Promise.all([
        loadActiveGroupingRules(transaction, version),
        transaction.guest.findMany({
          where: { enabled: true, groupLocked: false },
          include: { primaryGroup: true },
          orderBy: { attendanceNumber: "asc" },
        }),
        transaction.group.findMany({ where: { enabled: true } }),
        transaction.tag.findMany({ where: { enabled: true } }),
      ]);
      const groupByKey = new Map(groups.map((group) => [group.key, group]));
      const tagByKey = new Map(tags.map((tag) => [tag.key, tag]));
      let changedCount = 0;

      for (const guest of guests) {
        const result = await evaluateGrouping(
          {
            childCount: guest.childCount,
            isOutOfTown: guest.isOutOfTown,
            relation: guest.relation,
          },
          rules,
        );
        const targetGroup = result.primaryGroupKey
          ? groupByKey.get(result.primaryGroupKey)
          : undefined;
        const primaryGroupId = targetGroup?.id ?? null;
        const changed = guest.primaryGroupId !== primaryGroupId;
        if (changed) changedCount += 1;

        await transaction.guest.update({
          where: { id: guest.id },
          data: {
            primaryGroupId,
            matchedRuleId: targetGroup ? result.ruleId : null,
          },
        });
        await transaction.guestTag.deleteMany({ where: { guestId: guest.id } });
        const matchingTags = result.tags
          .map((key) => tagByKey.get(key))
          .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
        if (matchingTags.length) {
          await transaction.guestTag.createMany({
            data: matchingTags.map((tag) => ({ guestId: guest.id, tagId: tag.id })),
          });
        }
        if (changed) {
          await transaction.auditEvent.create({
            data: {
              actorId,
              action: "grouping.recalculated",
              entityType: "Guest",
              entityId: guest.id,
              beforeJson: { primaryGroupKey: guest.primaryGroup?.key ?? null },
              afterJson: { primaryGroupKey: targetGroup?.key ?? null, ruleSetId },
            },
          });
        }
      }

      return { processedCount: guests.length, changedCount, ruleSetId };
    },
    { isolationLevel: "Serializable" },
  );
}
