import { expect, test } from "@playwright/test";

import { db } from "@/lib/db";

test("persists an idempotent draw through the administrator APIs", async ({ page }) => {
  const marker = `draw-api-${Date.now()}`;
  const group = await db.group.create({ data: { key: marker, name: "接口测试组", color: "#4a624c", sortOrder: 110 } });
  const prize = await db.prize.create({ data: { name: marker, plannedWinnerCount: 1, sortOrder: 110, allowedGroups: { create: { groupId: group.id } } } });
  const guest = await db.guest.create({ data: { name: marker, normalizedName: marker, phoneLast4: "8181", relation: "OTHER", childCount: 0, originProvince: "北京", originCity: "北京市", isOutOfTown: false, primaryGroupId: group.id } });
  let roundId = "";

  try {
    await page.goto("/login");
    await page.getByLabel("管理员邮箱").fill(process.env.ADMIN_EMAIL!);
    await page.getByLabel("密码").fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "进入后台" }).click();
    await expect(page).toHaveURL(/\/admin$/);

    const createRequest = {
      headers: { "idempotency-key": marker },
      data: { prizeId: prize.id, targetGroupId: group.id, winnerCount: 1 },
    };
    const createdResponse = await page.request.post("/api/draw/rounds", createRequest);
    expect(createdResponse.status()).toBe(201);
    const created = (await createdResponse.json()).data;
    roundId = created.id;

    const replay = (await (await page.request.post("/api/draw/rounds", createRequest)).json()).data;
    expect(replay.id).toBe(roundId);

    const locked = (await (await page.request.post(`/api/draw/rounds/${roundId}/lock`, {
      headers: { "idempotency-key": `${marker}-lock` },
      data: { expectedVersion: created.version },
    })).json()).data;
    expect(locked).toMatchObject({ status: "LOCKED", candidateCount: 1 });

    const stale = await page.request.post(`/api/draw/rounds/${roundId}/draw`, {
      headers: { "idempotency-key": `${marker}-stale` },
      data: { expectedVersion: created.version },
    });
    expect(stale.status()).toBe(409);

    const drawn = (await (await page.request.post(`/api/draw/rounds/${roundId}/draw`, {
      headers: { "idempotency-key": `${marker}-draw` },
      data: { expectedVersion: locked.version },
    })).json()).data;
    expect(drawn.winners).toEqual([expect.objectContaining({ guestId: guest.id, status: "RESERVED" })]);

    const published = (await (await page.request.post(`/api/draw/rounds/${roundId}/publish`, {
      headers: { "idempotency-key": `${marker}-publish` },
      data: { expectedVersion: drawn.version },
    })).json()).data;
    expect(published).toMatchObject({ status: "PUBLISHED", version: 4 });
  } finally {
    if (roundId) {
      const winnerIds = (await db.winner.findMany({ where: { roundId }, select: { id: true } })).map((item) => item.id);
      await db.auditEvent.deleteMany({ where: { OR: [{ entityType: "DrawRound", entityId: roundId }, { entityType: "Winner", entityId: { in: winnerIds } }] } });
      await db.winner.deleteMany({ where: { roundId } });
      await db.drawCandidateSnapshot.deleteMany({ where: { roundId } });
      await db.drawRound.deleteMany({ where: { id: roundId } });
    }
    await db.idempotencyRecord.deleteMany({ where: { OR: [{ key: { startsWith: marker } }, { scope: { contains: roundId || "missing" } }] } });
    await db.guest.deleteMany({ where: { id: guest.id } });
    await db.prizeGroup.deleteMany({ where: { prizeId: prize.id } });
    await db.prize.deleteMany({ where: { id: prize.id } });
    await db.group.deleteMany({ where: { id: group.id } });
  }
});
