import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { evaluateGrouping } from "@/modules/grouping";
import { loadActiveGroupingRules } from "@/modules/grouping/service";
import { normalizeGuestName } from "./normalize";
import { registrationSchema, type RegistrationInput } from "./schema";

const IDEMPOTENCY_SCOPE = "public-registration";
const idempotencyKeySchema = z.string().trim().min(8).max(128);

const registrationResultSchema = z.object({
  guestId: z.string(),
  attendanceNumber: z.number().int().positive(),
  displayName: z.string(),
  primaryGroup: z
    .object({ key: z.string(), name: z.string() })
    .nullable(),
  grouped: z.boolean(),
  created: z.boolean(),
});

export type RegistrationResult = z.infer<typeof registrationResultSchema>;

function normalizedLocation(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
}

export async function registerGuest(
  rawInput: RegistrationInput,
  rawIdempotencyKey: string,
): Promise<RegistrationResult> {
  const input = registrationSchema.parse(rawInput);
  const idempotencyKey = idempotencyKeySchema.parse(rawIdempotencyKey);

  return db.$transaction(
    async (transaction) => {
      const replay = await transaction.idempotencyRecord.findUnique({
        where: {
          scope_key: { scope: IDEMPOTENCY_SCOPE, key: idempotencyKey },
        },
      });
      if (replay?.responseJson) {
        return registrationResultSchema.parse(replay.responseJson);
      }

      const settings = await transaction.weddingSettings.findUnique({
        where: { id: "default" },
      });
      if (!settings?.registrationOpen) {
        throw new RegistrationClosedError();
      }

      const normalizedName = normalizeGuestName(input.name);
      const isOutOfTown = Boolean(
        settings.venueCity &&
          normalizedLocation(input.originCity) !==
            normalizedLocation(settings.venueCity),
      );
      let grouping = {
        primaryGroupKey: null as string | null,
        tags: [] as string[],
        ruleId: null as string | null,
      };
      let groupingFailed = false;

      try {
        const rules = await loadActiveGroupingRules(transaction);
        grouping = await evaluateGrouping(
          {
            childCount: input.childCount,
            isOutOfTown,
            relation: input.relation,
          },
          rules,
        );
      } catch {
        groupingFailed = true;
      }

      const existing = await transaction.guest.findUnique({
        where: {
          normalizedName_phoneLast4_collisionDiscriminator: {
            normalizedName,
            phoneLast4: input.phoneLast4,
            collisionDiscriminator: 0,
          },
        },
      });
      const targetGroup = grouping.primaryGroupKey
        ? await transaction.group.findUnique({
            where: { key: grouping.primaryGroupKey },
          })
        : null;
      const matchedRuleId = targetGroup ? grouping.ruleId : null;
      const guestData = {
        name: input.name.trim(),
        normalizedName,
        phoneLast4: input.phoneLast4,
        relation: input.relation,
        childCount: input.childCount,
        originProvince: input.originProvince.trim(),
        originCity: input.originCity.trim(),
        isOutOfTown,
        checkedInAt: new Date(),
        deviceHash: input.deviceHash,
      };

      const guest = existing
        ? await transaction.guest.update({
            where: { id: existing.id },
            data: {
              ...guestData,
              ...(existing.groupLocked
                ? {}
                : {
                    primaryGroupId: targetGroup?.id ?? null,
                    matchedRuleId,
                  }),
            },
            include: { primaryGroup: true },
          })
        : await transaction.guest.create({
            data: {
              ...guestData,
              collisionDiscriminator: 0,
              primaryGroupId: targetGroup?.id ?? null,
              matchedRuleId,
            },
            include: { primaryGroup: true },
          });

      const matchingTags = grouping.tags.length
        ? await transaction.tag.findMany({
            where: { key: { in: grouping.tags }, enabled: true },
            select: { id: true },
          })
        : [];
      await transaction.guestTag.deleteMany({ where: { guestId: guest.id } });
      if (matchingTags.length) {
        await transaction.guestTag.createMany({
          data: matchingTags.map((tag) => ({ guestId: guest.id, tagId: tag.id })),
        });
      }

      const grouped = Boolean(guest.primaryGroup);
      const result: RegistrationResult = {
        guestId: guest.id,
        attendanceNumber: guest.attendanceNumber,
        displayName: guest.name,
        primaryGroup: guest.primaryGroup
          ? { key: guest.primaryGroup.key, name: guest.primaryGroup.name }
          : null,
        grouped,
        created: !existing,
      };
      const safeAuditPayload: Prisma.InputJsonObject = {
        attendanceNumber: guest.attendanceNumber,
        relation: guest.relation,
        childCount: guest.childCount,
        originProvince: guest.originProvince,
        originCity: guest.originCity,
        isOutOfTown: guest.isOutOfTown,
        primaryGroupKey: guest.primaryGroup?.key ?? null,
        grouped,
      };

      await transaction.auditEvent.create({
        data: {
          action:
            groupingFailed || !grouped
              ? "registration.grouping_failed"
              : existing
                ? "registration.updated"
                : "registration.created",
          entityType: "Guest",
          entityId: guest.id,
          afterJson: safeAuditPayload,
        },
      });
      await transaction.idempotencyRecord.create({
        data: {
          scope: IDEMPOTENCY_SCOPE,
          key: idempotencyKey,
          responseJson: result,
          statusCode: 200,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return result;
    },
    { isolationLevel: "Serializable" },
  );
}

export class RegistrationClosedError extends Error {
  constructor() {
    super("Registration is closed");
    this.name = "RegistrationClosedError";
  }
}
