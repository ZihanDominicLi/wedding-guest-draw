import type { GuestRelation, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { evaluateGrouping } from "@/modules/grouping";
import { loadActiveGroupingRules } from "@/modules/grouping/service";
import {
  normalizeGuestName,
  registrationSchema,
  type RegistrationInput,
} from "@/modules/registration";

export type GuestListQuery = {
  query?: string;
  primaryGroupKey?: string;
  tagKey?: string;
  enabled?: boolean;
  exception?: boolean;
  quizCompleted?: boolean;
  quizMinScore?: number;
  quizMaxScore?: number;
  page?: number;
  pageSize?: number;
};

export async function listGuests(query: GuestListQuery) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 30));
  const where: Prisma.GuestWhereInput = {
    ...(query.query
      ? { name: { contains: query.query.trim(), mode: "insensitive" } }
      : {}),
    ...(query.primaryGroupKey
      ? { primaryGroup: { key: query.primaryGroupKey } }
      : {}),
    ...(query.tagKey ? { tags: { some: { tag: { key: query.tagKey } } } } : {}),
    ...(query.enabled === undefined ? {} : { enabled: query.enabled }),
    ...(query.exception ? { primaryGroupId: null } : {}),
    ...(query.quizCompleted === undefined ? {} : query.quizCompleted ? { quizCompletedAt: { not: null } } : { quizCompletedAt: null }),
    ...(query.quizMinScore === undefined && query.quizMaxScore === undefined ? {} : { quizScore: { ...(query.quizMinScore === undefined ? {} : { gte: query.quizMinScore }), ...(query.quizMaxScore === undefined ? {} : { lte: query.quizMaxScore }) } }),
  };
  const [items, total] = await Promise.all([
    db.guest.findMany({
      where,
      include: { primaryGroup: true, tags: { include: { tag: true } } },
      orderBy: { attendanceNumber: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.guest.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export type GuestPatch = Partial<{
  name: string;
  relation: GuestRelation;
  childCount: number;
  originProvince: string;
  originCity: string;
  primaryGroupId: string | null;
  groupLocked: boolean;
  enabled: boolean;
}>;

export async function updateGuest(id: string, patch: GuestPatch, actorId: string) {
  return db.$transaction(async (transaction) => {
    const before = await transaction.guest.findUniqueOrThrow({ where: { id } });
    const updated = await transaction.guest.update({
      where: { id },
      data: {
        ...patch,
        ...(patch.name ? { normalizedName: normalizeGuestName(patch.name) } : {}),
      },
      include: { primaryGroup: true, tags: { include: { tag: true } } },
    });
    await transaction.auditEvent.create({
      data: {
        actorId,
        action: "guest.updated",
        entityType: "Guest",
        entityId: id,
        beforeJson: safeGuestAudit(before),
        afterJson: safeGuestAudit(updated),
      },
    });
    return updated;
  });
}

export async function deleteGuest(id: string, actorId: string) {
  return db.$transaction(async (transaction) => {
    const guest = await transaction.guest.findUniqueOrThrow({ where: { id } });

    await transaction.auditEvent.create({
      data: {
        actorId,
        action: "guest.deleted",
        entityType: "Guest",
        entityId: id,
        beforeJson: safeGuestAudit(guest),
        reason: "管理员删除宾客及其测试抽奖记录",
      },
    });
    await transaction.winner.deleteMany({ where: { guestId: id } });
    await transaction.drawCandidateSnapshot.deleteMany({ where: { guestId: id } });
    await transaction.guestTag.deleteMany({ where: { guestId: id } });
    return transaction.guest.delete({ where: { id } });
  });
}

export async function createCollisionGuest(
  rawInput: RegistrationInput,
  actorId: string,
) {
  const input = registrationSchema.parse(rawInput);
  const normalizedName = normalizeGuestName(input.name);

  return db.$transaction(
    async (transaction) => {
      const [settings, latestCollision, rules] = await Promise.all([
        transaction.weddingSettings.findUniqueOrThrow({ where: { id: "default" } }),
        transaction.guest.findFirst({
          where: { normalizedName, phoneLast4: input.phoneLast4 },
          orderBy: { collisionDiscriminator: "desc" },
        }),
        loadActiveGroupingRules(transaction),
      ]);
      if (!latestCollision) {
        throw new Error("Public identity must exist before creating a collision");
      }
      const isOutOfTown = Boolean(
        settings.venueCity &&
          input.originCity.normalize("NFKC").trim() !==
            settings.venueCity.normalize("NFKC").trim(),
      );
      const grouping = await evaluateGrouping(
        {
          childCount: input.childCount,
          isOutOfTown,
          relation: input.relation,
        },
        rules,
      );
      const targetGroup = grouping.primaryGroupKey
        ? await transaction.group.findUnique({ where: { key: grouping.primaryGroupKey } })
        : null;
      const guest = await transaction.guest.create({
        data: {
          name: input.name.trim(),
          normalizedName,
          phoneLast4: input.phoneLast4,
          collisionDiscriminator: latestCollision.collisionDiscriminator + 1,
          relation: input.relation,
          childCount: input.childCount,
          originProvince: input.originProvince.trim(),
          originCity: input.originCity.trim(),
          isOutOfTown,
          primaryGroupId: targetGroup?.id ?? null,
          matchedRuleId: targetGroup ? grouping.ruleId : null,
          deviceHash: input.deviceHash,
        },
      });
      const tags = await transaction.tag.findMany({
        where: { key: { in: grouping.tags }, enabled: true },
      });
      if (tags.length) {
        await transaction.guestTag.createMany({
          data: tags.map((tag) => ({ guestId: guest.id, tagId: tag.id })),
        });
      }
      await transaction.auditEvent.create({
        data: {
          actorId,
          action: "guest.collision_created",
          entityType: "Guest",
          entityId: guest.id,
          afterJson: safeGuestAudit(guest),
          reason: "管理员确认真实同名同后四位宾客",
        },
      });
      return guest;
    },
    { isolationLevel: "Serializable" },
  );
}

function safeGuestAudit(guest: {
  name: string;
  relation: GuestRelation;
  childCount: number;
  originProvince: string;
  originCity: string;
  primaryGroupId: string | null;
  groupLocked: boolean;
  enabled: boolean;
}): Prisma.InputJsonObject {
  return {
    name: guest.name,
    relation: guest.relation,
    childCount: guest.childCount,
    originProvince: guest.originProvince,
    originCity: guest.originCity,
    primaryGroupId: guest.primaryGroupId,
    groupLocked: guest.groupLocked,
    enabled: guest.enabled,
  };
}
