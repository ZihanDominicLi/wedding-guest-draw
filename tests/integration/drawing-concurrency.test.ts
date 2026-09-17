import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { createRound, drawRound, DrawingConflictError, lockRound } from "@/modules/drawing/service";

describe("concurrent overlapping draws", () => {
  const marker = `draw-concurrency-${Date.now()}`;
  let actorId: string;
  let groupId: string;
  let prizeId: string;
  let guestId: string;
  const roundIds: string[] = [];

  beforeAll(async () => {
    actorId = (await db.adminUser.findUniqueOrThrow({ where: { email: process.env.ADMIN_EMAIL! } })).id;
    groupId = (await db.group.create({ data: { key: marker, name: marker, color: "#4d654f", sortOrder: 100 } })).id;
    prizeId = (await db.prize.create({ data: { name: marker, plannedWinnerCount: 1, sortOrder: 100, allowedGroups: { create: { groupId } } } })).id;
    guestId = (await db.guest.create({ data: { name: marker, normalizedName: marker, phoneLast4: "9090", relation: "OTHER", childCount: 0, originProvince: "北京", originCity: "北京市", isOutOfTown: false, primaryGroupId: groupId } })).id;
  });

  afterAll(async () => {
    await db.winner.deleteMany({ where: { roundId: { in: roundIds } } });
    await db.drawCandidateSnapshot.deleteMany({ where: { roundId: { in: roundIds } } });
    await db.auditEvent.deleteMany({ where: { entityType: { in: ["DrawRound", "Winner"] }, entityId: { in: roundIds } } });
    await db.drawRound.deleteMany({ where: { id: { in: roundIds } } });
    await db.idempotencyRecord.deleteMany({ where: { scope: { startsWith: "draw:" } } });
    await db.guest.deleteMany({ where: { id: guestId } });
    await db.prizeGroup.deleteMany({ where: { prizeId } });
    await db.prize.deleteMany({ where: { id: prizeId } });
    await db.group.deleteMany({ where: { id: groupId } });
  });

  it("never persists the same active winner twice", async () => {
    const first = await createRound({ prizeId, targetGroupId: groupId, winnerCount: 1 }, actorId, `${marker}-create-1`);
    const second = await createRound({ prizeId, targetGroupId: groupId, winnerCount: 1 }, actorId, `${marker}-create-2`);
    roundIds.push(first.id, second.id);
    const firstLocked = await lockRound(first.id, first.version, actorId, `${marker}-lock-1`);
    const secondLocked = await lockRound(second.id, second.version, actorId, `${marker}-lock-2`);

    const outcomes = await Promise.allSettled([
      drawRound(first.id, firstLocked.version, actorId, `${marker}-draw-1`, () => 0),
      drawRound(second.id, secondLocked.version, actorId, `${marker}-draw-2`, () => 0),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: expect.any(DrawingConflictError) });
    await expect(db.winner.count({ where: { guestId, status: { in: ["RESERVED", "PUBLISHED"] } } })).resolves.toBe(1);
  });
});
