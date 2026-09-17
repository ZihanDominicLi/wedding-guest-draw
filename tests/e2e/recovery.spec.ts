import { expect, test } from "@playwright/test";

import { db } from "@/lib/db";
import { createRound, drawRound, lockRound } from "@/modules/drawing/service";

test("recovers registration and projector state without duplicate or reroll", async ({ page }) => {
  const marker = Date.now().toString();
  const registrationName = `恢复宾客${marker}`;
  const key = `recovery-registration-${marker}`;
  const group = await db.group.create({ data: { key: `recovery-${marker}`, name: "恢复测试组", color: "#4c624d", sortOrder: 130 } });
  const prize = await db.prize.create({ data: { name: `恢复测试礼${marker}`, plannedWinnerCount: 1, sortOrder: 130, allowedGroups: { create: { groupId: group.id } } } });
  const drawGuest = await db.guest.create({ data: { name: `大屏宾客${marker}`, normalizedName: `大屏宾客${marker}`, phoneLast4: "7373", relation: "OTHER", childCount: 0, originProvince: "北京", originCity: "北京市", isOutOfTown: false, primaryGroupId: group.id } });
  const actor = await db.adminUser.findUniqueOrThrow({ where: { email: process.env.ADMIN_EMAIL! } });
  let registeredGuestId = "";
  let roundId = "";

  try {
    await db.weddingSettings.update({ where: { id: "default" }, data: { registrationOpen: true, formalDrawMode: false } });
    const request = { headers: { "idempotency-key": key, "x-real-ip": `test-${marker}` }, data: { name: registrationName, phoneLast4: marker.slice(-4), relation: "MUTUAL_FRIEND", childCount: 0, originProvince: "北京", originCity: "北京市" } };
    const first = (await (await page.request.post("/api/registration", request)).json()).data;
    const replay = (await (await page.request.post("/api/registration", request)).json()).data;
    registeredGuestId = first.guestId;
    expect(replay.guestId).toBe(first.guestId);
    await expect(db.guest.count({ where: { normalizedName: registrationName } })).resolves.toBe(1);

    await page.goto("/login");
    await page.getByLabel("管理员邮箱").fill(process.env.ADMIN_EMAIL!);
    await page.getByLabel("密码").fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "进入后台" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    const rejected = await page.request.put("/api/admin/settings", { headers: { origin: "https://evil.example" }, multipart: {} });
    expect(rejected.status()).toBe(403);

    const created = await createRound({ prizeId: prize.id, targetGroupId: group.id, winnerCount: 1 }, actor.id, `${marker}-create`);
    roundId = created.id;
    const locked = await lockRound(created.id, created.version, actor.id, `${marker}-lock`);
    const drawn = await drawRound(created.id, locked.version, actor.id, `${marker}-draw`, () => 0);
    expect(drawn.winners[0].guestId).toBe(drawGuest.id);

    await page.goto("/screen");
    await expect(page.getByRole("heading", { name: drawGuest.name })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: drawGuest.name })).toBeVisible();
  } finally {
    const winnerIds = roundId ? (await db.winner.findMany({ where: { roundId }, select: { id: true } })).map((item) => item.id) : [];
    await db.auditEvent.deleteMany({ where: { OR: [{ entityType: "DrawRound", entityId: roundId }, { entityType: "Winner", entityId: { in: winnerIds } }, { entityType: "Guest", entityId: registeredGuestId }, { action: "screen.presence" }] } });
    await db.winner.deleteMany({ where: { roundId } });
    await db.drawCandidateSnapshot.deleteMany({ where: { roundId } });
    await db.drawRound.deleteMany({ where: { id: roundId } });
    await db.idempotencyRecord.deleteMany({ where: { OR: [{ key }, { key: { startsWith: marker } }] } });
    await db.rateLimitBucket.deleteMany({ where: { bucketKey: `registration:test-${marker}` } });
    await db.guest.deleteMany({ where: { id: { in: [drawGuest.id, registeredGuestId].filter(Boolean) } } });
    await db.prizeGroup.deleteMany({ where: { prizeId: prize.id } });
    await db.prize.deleteMany({ where: { id: prize.id } });
    await db.group.deleteMany({ where: { id: group.id } });
  }
});
