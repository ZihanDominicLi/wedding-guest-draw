import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { withTransactionIdempotency } from "@/lib/idempotency";
import { evaluateGrouping } from "@/modules/grouping";
import { loadActiveGroupingRules } from "@/modules/grouping/service";
import { publishLiveEvent } from "@/modules/live/bus";
import { normalizeGuestName } from "./normalize";
import { registrationSchema, type RegistrationInput } from "./schema";
import { hashParticipantToken, issueParticipantToken } from "@/modules/quiz/participant-token";

const IDEMPOTENCY_SCOPE = "public-registration";
const idempotencyKeySchema = z.string().trim().min(8).max(128);

export type RegistrationResult = {
  guestId: string;
  attendanceNumber: number;
  displayName: string;
  primaryGroup: { key: string; name: string } | null;
  grouped: boolean;
  created: boolean;
  quizAccess: {
    available: boolean;
    rawToken?: string;
    sessionId?: string;
  };
};

function normalizedLocation(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
}

export async function registerGuest(
  rawInput: RegistrationInput,
  rawIdempotencyKey: string,
  existingQuizToken?: string | null,
): Promise<RegistrationResult> {
  const input = registrationSchema.parse(rawInput);
  const idempotencyKey = idempotencyKeySchema.parse(rawIdempotencyKey);

  const result = await db.$transaction(
    async (transaction) =>
      withTransactionIdempotency(
        transaction,
        IDEMPOTENCY_SCOPE,
        idempotencyKey,
        async () => {
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

      const quizSession =
        (await transaction.quizSession.findFirst({ where: { status: "LIVE" }, orderBy: { createdAt: "desc" } })) ??
        (await transaction.quizSession.findFirst({ where: { status: "READY" }, orderBy: { createdAt: "desc" } }));
      const suppliedHash = existingQuizToken ? hashParticipantToken(existingQuizToken) : null;
      const existingParticipant = quizSession
        ? await transaction.quizParticipant.findUnique({
            where: { sessionId_guestId: { sessionId: quizSession.id, guestId: guest.id } },
          })
        : null;
      let rawToken: string;
      let tokenHash: string;
      if (suppliedHash && suppliedHash === guest.registrationTokenHash) {
        rawToken = existingQuizToken!;
        tokenHash = suppliedHash;
      } else if (suppliedHash && existingParticipant?.tokenHash === suppliedHash) {
        rawToken = existingQuizToken!;
        tokenHash = suppliedHash;
        await transaction.guest.update({ where: { id: guest.id }, data: { registrationTokenHash: tokenHash } });
      } else {
        const token = issueParticipantToken();
        rawToken = token.rawToken;
        tokenHash = token.tokenHash;
        await transaction.guest.update({ where: { id: guest.id }, data: { registrationTokenHash: tokenHash } });
      }
      const quizAccess: RegistrationResult["quizAccess"] = {
        available: true,
        rawToken,
        ...(quizSession ? { sessionId: quizSession.id } : {}),
      };
      if (quizSession) {
        await transaction.quizParticipant.upsert({
          where: { sessionId_guestId: { sessionId: quizSession.id, guestId: guest.id } },
          create: { sessionId: quizSession.id, guestId: guest.id, tokenHash },
          update: { tokenHash },
        });
      }

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
        quizAccess,
      };
      const safeAuditPayload: Prisma.InputJsonObject = {
        attendanceNumber: guest.attendanceNumber,
        relation: guest.relation,
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
          return result;
        },
        {
          serialize: (value) => ({
            guestId: value.guestId,
            attendanceNumber: value.attendanceNumber,
            displayName: value.displayName,
            primaryGroup: value.primaryGroup,
            grouped: value.grouped,
            created: value.created,
            quizAccess: {
              available: value.quizAccess.available,
              sessionId: value.quizAccess.sessionId,
            },
          }),
          onReplay: async (stored) => {
            const safe = stored as RegistrationResult;
            const suppliedHash = existingQuizToken ? hashParticipantToken(existingQuizToken) : null;
            const token = issueParticipantToken();
            const guest = await transaction.guest.findUnique({
              where: { id: safe.guestId },
              select: { registrationTokenHash: true },
            });
            if (suppliedHash && suppliedHash === guest?.registrationTokenHash) {
              return { ...safe, quizAccess: { ...safe.quizAccess, rawToken: existingQuizToken! } };
            }
            await transaction.guest.update({
              where: { id: safe.guestId },
              data: { registrationTokenHash: token.tokenHash },
            });
            await transaction.quizParticipant.updateMany({
              where: { guestId: safe.guestId },
              data: { tokenHash: token.tokenHash },
            });
            return {
              ...safe,
              quizAccess: { ...safe.quizAccess, available: true, rawToken: token.rawToken },
            };
          },
        },
      ),
    { isolationLevel: "Serializable" },
  );
  publishLiveEvent({
    type: "guest.changed",
    scope: "admin",
    payload: { guestId: result.guestId, created: result.created },
  });
  return result;
}

export class RegistrationClosedError extends Error {
  constructor() {
    super("Registration is closed");
    this.name = "RegistrationClosedError";
  }
}
