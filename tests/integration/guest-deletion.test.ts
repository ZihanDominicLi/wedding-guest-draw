import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { deleteGuest } from "@/modules/guests/service";

const marker = "删除测试宾客";
let groupId = "";
let prizeId = "";
let roundId = "";
let guestId = "";

async function cleanup() {
  if (roundId) {
    await db.winner.deleteMany({ where: { roundId } });
    await db.drawCandidateSnapshot.deleteMany({ where: { roundId } });
    await db.drawRound.deleteMany({ where: { id: roundId } });
  }
  if (prizeId) {
    await db.prizeGroup.deleteMany({ where: { prizeId } });
    await db.prize.deleteMany({ where: { id: prizeId } });
  }
  if (guestId) {
    await db.guestTag.deleteMany({ where: { guestId } });
    await db.auditEvent.deleteMany({ where: { entityType: "Guest", entityId: guestId } });
    await db.guest.deleteMany({ where: { id: guestId } });
  }
  if (groupId) {
    await db.group.deleteMany({ where: { id: groupId } });
  }
  groupId = "";
  prizeId = "";
  roundId = "";
  guestId = "";
}

describe("deleteGuest", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("deletes a guest and its draw records while preserving the draw round", async () => {
    const actor = await db.adminUser.findFirstOrThrow();
    const group = await db.group.create({
      data: { key: `${marker}-group`, name: `${marker}组`, color: "#555555", sortOrder: 99 },
    });
    groupId = group.id;
    const prize = await db.prize.create({
      data: { name: `${marker}奖品`, plannedWinnerCount: 1, sortOrder: 99 },
    });
    prizeId = prize.id;
    await db.prizeGroup.create({ data: { prizeId: prize.id, groupId: group.id } });
    const guest = await db.guest.create({
      data: {
        name: marker,
        normalizedName: marker,
        phoneLast4: "2468",
        relation: "OTHER",
        originProvince: "北京",
        originCity: "北京市",
        isOutOfTown: false,
        primaryGroupId: group.id,
      },
    });
    guestId = guest.id;
    const round = await db.drawRound.create({
      data: {
        prizeId: prize.id,
        targetGroupId: group.id,
        plannedWinnerCount: 1,
        status: "PUBLISHED",
      },
    });
    roundId = round.id;
    await db.drawCandidateSnapshot.create({
      data: { roundId: round.id, guestId: guest.id, displayName: guest.name, groupName: group.name },
    });
    await db.winner.create({ data: { roundId: round.id, guestId: guest.id, prizeId: prize.id, status: "PUBLISHED" } });

    await deleteGuest(guest.id, actor.id);

    await expect(db.guest.findUnique({ where: { id: guest.id } })).resolves.toBeNull();
    await expect(db.winner.count({ where: { guestId: guest.id } })).resolves.toBe(0);
    await expect(db.drawCandidateSnapshot.count({ where: { guestId: guest.id } })).resolves.toBe(0);
    await expect(db.drawRound.findUnique({ where: { id: round.id } })).resolves.not.toBeNull();
    await expect(
      db.auditEvent.findFirst({ where: { action: "guest.deleted", entityId: guest.id } }),
    ).resolves.toMatchObject({ actorId: actor.id });
  });
});
