import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";

async function resetDrawData() {
  await db.winner.deleteMany();
  await db.drawCandidateSnapshot.deleteMany();
  await db.drawRound.deleteMany();
  await db.prizeGroup.deleteMany();
  await db.prize.deleteMany();
  await db.guestTag.deleteMany();
  await db.guest.deleteMany();
  await db.group.deleteMany({ where: { key: "friends" } });
}

describe("database invariants", () => {
  beforeEach(resetDrawData);
  afterEach(resetDrawData);

  it("rejects duplicate public guest keys", async () => {
    const guest = {
      name: "张三",
      normalizedName: "张三",
      phoneLast4: "1234",
      collisionDiscriminator: 0,
      relation: "OTHER" as const,
      childCount: 0,
      originProvince: "北京",
      originCity: "北京市",
      isOutOfTown: false,
    };

    await db.guest.create({ data: guest });

    await expect(db.guest.create({ data: guest })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("allows only one active winner record per guest", async () => {
    const group = await db.group.create({
      data: { key: "friends", name: "共同好友组", color: "#4b5d4a", sortOrder: 1 },
    });
    const prize = await db.prize.create({
      data: { name: "纪念礼", plannedWinnerCount: 1, sortOrder: 1 },
    });
    const guest = await db.guest.create({
      data: {
        name: "李四",
        normalizedName: "李四",
        phoneLast4: "5678",
        relation: "MUTUAL_FRIEND",
        childCount: 0,
        originProvince: "北京",
        originCity: "北京市",
        isOutOfTown: false,
        primaryGroupId: group.id,
      },
    });
    const firstRound = await db.drawRound.create({
      data: {
        prizeId: prize.id,
        targetGroupId: group.id,
        plannedWinnerCount: 1,
      },
    });
    const secondRound = await db.drawRound.create({
      data: {
        prizeId: prize.id,
        targetGroupId: group.id,
        plannedWinnerCount: 1,
      },
    });

    await db.winner.create({
      data: {
        roundId: firstRound.id,
        guestId: guest.id,
        prizeId: prize.id,
        status: "RESERVED",
      },
    });

    await expect(
      db.winner.create({
        data: {
          roundId: secondRound.id,
          guestId: guest.id,
          prizeId: prize.id,
          status: "PUBLISHED",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
