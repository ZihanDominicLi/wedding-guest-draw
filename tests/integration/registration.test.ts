import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { registerGuest } from "@/modules/registration/service";

const baseInput = {
  name: "王小明",
  phoneLast4: "2468",
  relation: "GROOM_FRIEND" as const,
  childCount: 1,
  originProvince: "浙江",
  originCity: "杭州市",
};

async function cleanRegistrationData() {
  await db.guestTag.deleteMany();
  await db.guest.deleteMany({
    where: { normalizedName: { in: ["王小明", "赵六", "未分组宾客"] } },
  });
  await db.idempotencyRecord.deleteMany({
    where: { scope: "public-registration" },
  });
  await db.auditEvent.deleteMany({
    where: { entityType: "Guest", actorId: null },
  });
}

describe("registerGuest", () => {
  beforeEach(async () => {
    await cleanRegistrationData();
    await db.weddingSettings.update({
      where: { id: "default" },
      data: { venueProvince: "北京", venueCity: "北京市", registrationOpen: true },
    });
  });

  afterEach(cleanRegistrationData);

  it("returns the persisted response when an idempotency key is retried", async () => {
    const first = await registerGuest(baseInput, "registration-retry-1");
    const retried = await registerGuest(
      { ...baseInput, childCount: 0 },
      "registration-retry-1",
    );

    expect(first.created).toBe(true);
    expect(first.primaryGroup?.key).toBe("family-with-children");
    expect(retried).toEqual(first);
    await expect(
      db.guest.count({ where: { normalizedName: "王小明" } }),
    ).resolves.toBe(1);
  });

  it("updates the same public identity on a new submission", async () => {
    const first = await registerGuest(baseInput, "registration-update-1");
    const updated = await registerGuest(
      {
        ...baseInput,
        name: " 王 小明 ",
        childCount: 0,
        originProvince: "北京",
        originCity: "北京市",
      },
      "registration-update-2",
    );

    expect(updated.guestId).toBe(first.guestId);
    expect(updated.created).toBe(false);
    expect(updated.primaryGroup?.key).toBe("groom-guests");
    await expect(
      db.guest.count({ where: { normalizedName: "王小明" } }),
    ).resolves.toBe(1);
  });

  it("creates a separate record for a different public identity", async () => {
    await registerGuest(baseInput, "registration-unique-1");
    await registerGuest(
      { ...baseInput, name: "赵六", phoneLast4: "1357" },
      "registration-unique-2",
    );

    await expect(
      db.guest.count({
        where: { normalizedName: { in: ["王小明", "赵六"] } },
      }),
    ).resolves.toBe(2);
  });

  it("persists an ungrouped exception when no primary rule is enabled", async () => {
    await db.groupingRule.updateMany({
      where: { kind: "PRIMARY" },
      data: { enabled: false },
    });

    try {
      const result = await registerGuest(
        {
          ...baseInput,
          name: "未分组宾客",
          phoneLast4: "9999",
          childCount: 0,
          relation: "OTHER",
        },
        "registration-ungrouped-1",
      );

      expect(result.primaryGroup).toBeNull();
      expect(result.grouped).toBe(false);
      await expect(
        db.auditEvent.count({
          where: {
            entityId: result.guestId,
            action: "registration.grouping_failed",
          },
        }),
      ).resolves.toBe(1);
    } finally {
      await db.groupingRule.updateMany({
        where: { kind: "PRIMARY" },
        data: { enabled: true },
      });
    }
  });
});
