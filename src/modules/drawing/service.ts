import { randomInt as cryptoRandomInt } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";
import { withTransactionIdempotency } from "@/lib/idempotency";
import { publishLiveEvent } from "@/modules/live/bus";
import { eligibleGuestWhere } from "./eligibility";
import { resolveScoreThreshold } from "./score-threshold";
import { sampleWithoutReplacement, type RandomInt } from "./random";
import type { CreateRoundInput, RoundResult } from "./types";

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const ACTIVE_WINNER_STATUSES = ["RESERVED", "PUBLISHED"] as const;

export class DrawingStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrawingStateError";
  }
}

export class DrawingConflictError extends Error {
  constructor(message = "The candidate pool changed during drawing") {
    super(message);
    this.name = "DrawingConflictError";
  }
}

export class DrawingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrawingValidationError";
  }
}

export class BackupRequiredError extends Error {
  constructor() {
    super("A fresh backup is required before locking a formal draw");
    this.name = "BackupRequiredError";
  }
}

function assertVersion(
  round: { status: string; version: number },
  expectedStatus: string | string[],
  expectedVersion: number,
) {
  const statuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (round.version !== expectedVersion || !statuses.includes(round.status)) {
    throw new DrawingStateError(
      `Expected ${statuses.join("/")} version ${expectedVersion}; received ${round.status} version ${round.version}`,
    );
  }
}

function isKnownPrismaError(error: unknown, codes: string[]) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && codes.includes(error.code)
  );
}

async function serializable<T>(operation: (transaction: Transaction) => Promise<T>) {
  let latestError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      latestError = error;
      if (!isKnownPrismaError(error, ["P2034"]) || attempt === 2) throw error;
    }
  }
  throw latestError;
}

function asJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function roundResult(
  round: {
    id: string;
    prizeId: string;
    targetGroupId: string;
    plannedWinnerCount: number;
    status: RoundResult["status"];
    version: number;
    scoreThreshold?: number | null;
    actualScoreThreshold?: number | null;
    scoreFallbackCount?: number | null;
  },
  winners: RoundResult["winners"] = [],
  candidateCount?: number,
): RoundResult {
  return {
    id: round.id,
    prizeId: round.prizeId,
    targetGroupId: round.targetGroupId,
    winnerCount: round.plannedWinnerCount,
    status: round.status,
    version: round.version,
    scoreThreshold: round.scoreThreshold,
    actualScoreThreshold: round.actualScoreThreshold,
    scoreFallbackCount: round.scoreFallbackCount,
    ...(candidateCount === undefined ? {} : { candidateCount }),
    winners,
  };
}

async function appendRoundAudit(
  transaction: Transaction,
  actorId: string,
  roundId: string,
  action: string,
  afterJson: Prisma.InputJsonValue,
  reason?: string,
) {
  await transaction.auditEvent.create({
    data: {
      actorId,
      action,
      entityType: "DrawRound",
      entityId: roundId,
      afterJson,
      reason,
    },
  });
}

function announce(result: RoundResult) {
  publishLiveEvent({ type: "round.changed", scope: "admin", payload: asJson(result) as Record<string, unknown> });
  publishLiveEvent({
    type: "round.changed",
    scope: "screen",
    payload: {
      roundId: result.id,
      status: result.status,
      version: result.version,
    },
  });
  return result;
}

export async function createRound(
  input: CreateRoundInput,
  actorId: string,
  idempotencyKey: string,
) {
  if (!Number.isInteger(input.winnerCount) || input.winnerCount < 1) {
    throw new DrawingValidationError("Winner count must be a positive integer");
  }
  const result = await serializable((transaction) =>
    withTransactionIdempotency(transaction, "draw:create", idempotencyKey, async () => {
      const prize = await transaction.prize.findFirst({
        where: {
          id: input.prizeId,
          enabled: true,
          allowedGroups: { some: { groupId: input.targetGroupId } },
        },
      });
      const group = await transaction.group.findFirst({
        where: { id: input.targetGroupId, enabled: true },
      });
      if (!prize || !group) throw new DrawingValidationError("Prize or group is unavailable");

      const round = await transaction.drawRound.create({
        data: {
          prizeId: input.prizeId,
          targetGroupId: input.targetGroupId,
          plannedWinnerCount: input.winnerCount,
          operatorId: actorId,
          scoreThreshold: input.scoreThreshold ?? null,
          scoreFallbackStep: input.scoreFallbackStep ?? 1,
        },
      });
      const response = roundResult(round);
      await appendRoundAudit(transaction, actorId, round.id, "draw.round_created", asJson(response));
      return response;
    }),
  );
  return announce(result);
}

export async function lockRound(
  roundId: string,
  expectedVersion: number,
  actorId: string,
  idempotencyKey: string,
  options: { backupOverrideReason?: string } = {},
) {
  const result = await serializable((transaction) =>
    withTransactionIdempotency(transaction, `draw:lock:${roundId}`, idempotencyKey, async () => {
      const round = await transaction.drawRound.findUniqueOrThrow({ where: { id: roundId } });
      assertVersion(round, "PREPARING", expectedVersion);
      const settings = await transaction.weddingSettings.findUniqueOrThrow({ where: { id: "default" } });
      if (settings.formalDrawMode) {
        const freshBackup = await transaction.backupRecord.findFirst({
          where: { createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
          orderBy: { createdAt: "desc" },
        });
        if (!freshBackup && !options.backupOverrideReason?.trim()) throw new BackupRequiredError();
        if (!freshBackup) {
          await transaction.auditEvent.create({ data: { actorId, action: "draw.backup_override", entityType: "DrawRound", entityId: roundId, reason: options.backupOverrideReason!.trim() } });
        }
      }
      const initialThreshold = round.scoreThreshold;
      const fallbackStep = round.scoreFallbackStep ?? 1;
      const scoreFiltered = initialThreshold !== null;
      const allEligible = await transaction.guest.findMany({
        where: {
          ...eligibleGuestWhere(round.targetGroupId, null),
          ...(scoreFiltered ? { quizCompletedAt: { not: null }, quizScore: { not: null } } : {}),
        },
        select: { id: true, name: true, quizScore: true, primaryGroup: { select: { name: true } } },
        orderBy: { attendanceNumber: "asc" },
      });
      let actualThreshold = initialThreshold;
      let fallbackCount = 0;
      let candidates = allEligible;
      if (scoreFiltered) {
        const resolved = resolveScoreThreshold(allEligible.map((candidate) => candidate.quizScore ?? -1), initialThreshold ?? 0, round.plannedWinnerCount, fallbackStep);
        actualThreshold = resolved.actualThreshold;
        fallbackCount = resolved.fallbackCount;
        candidates = allEligible.filter((candidate) => (candidate.quizScore ?? -1) >= resolved.actualThreshold);
      }
      if (candidates.length === 0) {
        throw new DrawingValidationError("Not enough eligible candidates");
      }
      const actualWinnerCount = Math.min(round.plannedWinnerCount, candidates.length);

      await transaction.drawCandidateSnapshot.createMany({
        data: candidates.map((candidate) => ({
          roundId,
          guestId: candidate.id,
          displayName: candidate.name,
          groupName: candidate.primaryGroup?.name ?? "未分组",
        })),
      });
      const updated = await transaction.drawRound.update({
        where: { id: roundId },
        data: { status: "LOCKED", lockedAt: new Date(), plannedWinnerCount: actualWinnerCount, actualScoreThreshold: actualThreshold, scoreFallbackCount: fallbackCount, version: { increment: 1 } },
      });
      const response = roundResult(updated, [], candidates.length);
      await appendRoundAudit(transaction, actorId, roundId, "draw.round_locked", asJson(response), actualWinnerCount < round.plannedWinnerCount ? "候选人不足，中奖名额已调整为实际候选人数" : undefined);
      return response;
    }),
  );
  return announce(result);
}

export async function drawRound(
  roundId: string,
  expectedVersion: number,
  actorId: string,
  idempotencyKey: string,
  randomInt: RandomInt = cryptoRandomInt,
) {
  try {
    const result = await serializable((transaction) =>
      withTransactionIdempotency(transaction, `draw:execute:${roundId}`, idempotencyKey, async () => {
        const round = await transaction.drawRound.findUniqueOrThrow({
          where: { id: roundId },
          include: { snapshots: { orderBy: { id: "asc" } } },
        });
        assertVersion(round, "LOCKED", expectedVersion);
        if (round.snapshots.length < round.plannedWinnerCount) {
          throw new DrawingValidationError("Snapshot has too few candidates");
        }
        const selected = sampleWithoutReplacement(
          round.snapshots,
          round.plannedWinnerCount,
          randomInt,
        );
        const winners: RoundResult["winners"] = [];
        for (const candidate of selected) {
          const winner = await transaction.winner.create({
            data: {
              roundId,
              guestId: candidate.guestId,
              prizeId: round.prizeId,
              status: "RESERVED",
            },
          });
          winners.push({
            id: winner.id,
            guestId: winner.guestId,
            name: candidate.displayName,
            status: winner.status,
          });
        }
        const updated = await transaction.drawRound.update({
          where: { id: roundId },
          data: { status: "DRAWN", drawnAt: new Date(), version: { increment: 1 } },
        });
        const response = roundResult(updated, winners, round.snapshots.length);
        await appendRoundAudit(transaction, actorId, roundId, "draw.round_drawn", asJson(response));
        return response;
      }),
    );
    return announce(result);
  } catch (error) {
    if (isKnownPrismaError(error, ["P2002", "P2034"])) throw new DrawingConflictError();
    throw error;
  }
}

export async function publishRound(
  roundId: string,
  expectedVersion: number,
  actorId: string,
  idempotencyKey: string,
) {
  const result = await serializable((transaction) =>
    withTransactionIdempotency(transaction, `draw:publish:${roundId}`, idempotencyKey, async () => {
      const round = await transaction.drawRound.findUniqueOrThrow({
        where: { id: roundId },
        include: { winners: true, snapshots: true },
      });
      assertVersion(round, "DRAWN", expectedVersion);
      const now = new Date();
      await transaction.winner.updateMany({
        where: { roundId, status: "RESERVED" },
        data: { status: "PUBLISHED", publishedAt: now },
      });
      const updated = await transaction.drawRound.update({
        where: { id: roundId },
        data: { status: "PUBLISHED", publishedAt: now, version: { increment: 1 } },
      });
      const names = new Map(round.snapshots.map((item) => [item.guestId, item.displayName]));
      const winners = round.winners.map((winner) => ({
        id: winner.id,
        guestId: winner.guestId,
        name: names.get(winner.guestId) ?? "宾客",
        status: "PUBLISHED" as const,
      }));
      const response = roundResult(updated, winners, round.snapshots.length);
      await appendRoundAudit(transaction, actorId, roundId, "draw.round_published", asJson(response));
      return response;
    }),
  );
  return announce(result);
}

export async function cancelRound(
  roundId: string,
  expectedVersion: number,
  actorId: string,
  reason: string,
  idempotencyKey: string,
) {
  if (!reason.trim()) throw new DrawingValidationError("Cancellation reason is required");
  const result = await serializable((transaction) =>
    withTransactionIdempotency(transaction, `draw:cancel:${roundId}`, idempotencyKey, async () => {
      const round = await transaction.drawRound.findUniqueOrThrow({ where: { id: roundId } });
      assertVersion(round, ["PREPARING", "LOCKED", "DRAWN"], expectedVersion);
      const now = new Date();
      await transaction.winner.updateMany({
        where: { roundId, status: { in: [...ACTIVE_WINNER_STATUSES] } },
        data: { status: "REVOKED", revokedAt: now, revokeReason: reason.trim() },
      });
      const updated = await transaction.drawRound.update({
        where: { id: roundId },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancellationReason: reason.trim(),
          version: { increment: 1 },
        },
      });
      const response = roundResult(updated);
      await appendRoundAudit(transaction, actorId, roundId, "draw.round_cancelled", asJson(response), reason.trim());
      return response;
    }),
  );
  return announce(result);
}

export async function revokeWinner(
  winnerId: string,
  actorId: string,
  reason: string,
  idempotencyKey: string,
) {
  if (!reason.trim()) throw new DrawingValidationError("Revocation reason is required");
  return serializable((transaction) =>
    withTransactionIdempotency(transaction, `draw:revoke:${winnerId}`, idempotencyKey, async () => {
      const winner = await transaction.winner.findUniqueOrThrow({ where: { id: winnerId } });
      if (!ACTIVE_WINNER_STATUSES.includes(winner.status as (typeof ACTIVE_WINNER_STATUSES)[number])) {
        throw new DrawingStateError("Winner is not active");
      }
      const updated = await transaction.winner.update({
        where: { id: winnerId },
        data: { status: "REVOKED", revokedAt: new Date(), revokeReason: reason.trim() },
      });
      await transaction.auditEvent.create({
        data: {
          actorId,
          action: "draw.winner_revoked",
          entityType: "Winner",
          entityId: winnerId,
          afterJson: { status: updated.status, roundId: updated.roundId },
          reason: reason.trim(),
        },
      });
      return updated;
    }),
  );
}
