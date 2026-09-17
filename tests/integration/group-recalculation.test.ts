import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  applyRecalculation,
  previewRecalculation,
} from "@/modules/grouping/service";
import { createCollisionGuest } from "@/modules/guests/service";

const testNames = ["锁组宾客", "普通宾客", "同名宾客"];

async function cleanup() {
  const guests = await db.guest.findMany({
    where: { normalizedName: { in: testNames } },
    select: { id: true },
  });
  const guestIds = guests.map((guest) => guest.id);
  await db.guestTag.deleteMany({ where: { guestId: { in: guestIds } } });
  await db.auditEvent.deleteMany({
    where: { entityType: "Guest", entityId: { in: guestIds } },
  });
  await db.guest.deleteMany({ where: { id: { in: guestIds } } });
}

describe("group recalculation and identity collisions", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("changes unlocked guests but preserves a manually locked group", async () => {
    const actor = await db.adminUser.findUniqueOrThrow({
      where: { email: process.env.ADMIN_EMAIL! },
    });
    const groomGroup = await db.group.findUniqueOrThrow({
      where: { key: "groom-guests" },
    });
    const otherGroup = await db.group.findUniqueOrThrow({
      where: { key: "other-guests" },
    });
    const common = {
      phoneLast4: "4444",
      relation: "GROOM_FRIEND" as const,
      childCount: 0,
      originProvince: "北京",
      originCity: "北京市",
      isOutOfTown: false,
      primaryGroupId: otherGroup.id,
    };
    const locked = await db.guest.create({
      data: {
        ...common,
        name: "锁组宾客",
        normalizedName: "锁组宾客",
        groupLocked: true,
      },
    });
    const unlocked = await db.guest.create({
      data: {
        ...common,
        phoneLast4: "5555",
        name: "普通宾客",
        normalizedName: "普通宾客",
      },
    });

    const preview = await previewRecalculation("1");
    expect(preview.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ guestId: unlocked.id, toGroupKey: "groom-guests" }),
      ]),
    );
    expect(preview.changes.some((change) => change.guestId === locked.id)).toBe(false);

    await applyRecalculation("1", actor.id);

    await expect(
      db.guest.findUniqueOrThrow({ where: { id: locked.id } }),
    ).resolves.toMatchObject({ primaryGroupId: otherGroup.id, groupLocked: true });
    await expect(
      db.guest.findUniqueOrThrow({ where: { id: unlocked.id } }),
    ).resolves.toMatchObject({ primaryGroupId: groomGroup.id, groupLocked: false });
  });

  it("creates an administrator-confirmed collision without replacing public identity zero", async () => {
    const actor = await db.adminUser.findUniqueOrThrow({
      where: { email: process.env.ADMIN_EMAIL! },
    });
    const publicGuest = await db.guest.create({
      data: {
        name: "同名宾客",
        normalizedName: "同名宾客",
        phoneLast4: "6666",
        relation: "OTHER",
        childCount: 0,
        originProvince: "北京",
        originCity: "北京市",
        isOutOfTown: false,
      },
    });

    const collision = await createCollisionGuest(
      {
        name: "同名宾客",
        phoneLast4: "6666",
        relation: "OTHER",
        childCount: 0,
        originProvince: "北京",
        originCity: "北京市",
      },
      actor.id,
    );

    expect(publicGuest.collisionDiscriminator).toBe(0);
    expect(collision.collisionDiscriminator).toBe(1);
    await expect(
      db.guest.count({
        where: { normalizedName: "同名宾客", phoneLast4: "6666" },
      }),
    ).resolves.toBe(2);
  });
});
