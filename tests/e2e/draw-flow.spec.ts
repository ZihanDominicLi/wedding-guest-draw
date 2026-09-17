import { expect, test } from "@playwright/test";

import { db } from "@/lib/db";

test("runs a persisted group draw and restores the projector result", async ({ context, page }) => {
  const marker = `draw-flow-${Date.now()}`;
  const group = await db.group.create({ data: { key: marker, name: "现场好友组", color: "#4c624d", sortOrder: 120 } });
  const prize = await db.prize.create({ data: { name: "现场纪念礼", plannedWinnerCount: 1, sortOrder: 120, allowedGroups: { create: { groupId: group.id } } } });
  const guests = await Promise.all([1, 2, 3].map((index) => db.guest.create({ data: { name: `抽奖宾客${index}`, normalizedName: `${marker}-${index}`, phoneLast4: `92${index}${index}`, relation: "MUTUAL_FRIEND", childCount: 0, originProvince: "北京", originCity: "北京市", isOutOfTown: false, primaryGroupId: group.id } })));
  const roundIds: string[] = [];
  const screen = await context.newPage();

  try {
    await screen.setViewportSize({ width: 1366, height: 768 });
    await screen.goto("/screen");
    await expect(screen.getByRole("heading", { name: "静候仪式开始" })).toBeVisible();

    const pixels = await screen.locator("canvas").evaluate(async (canvas: HTMLCanvasElement) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const image = new Image();
      image.src = canvas.toDataURL("image/png");
      await image.decode();
      const sample = document.createElement("canvas");
      sample.width = 64; sample.height = 36;
      const context2d = sample.getContext("2d")!;
      context2d.drawImage(image, 0, 0, 64, 36);
      const data = context2d.getImageData(0, 0, 64, 36).data;
      let visible = 0;
      for (let index = 3; index < data.length; index += 4) if (data[index] > 0) visible += 1;
      return visible;
    });
    expect(pixels).toBeGreaterThan(2);

    await page.goto("/login");
    await page.getByLabel("管理员邮箱").fill(process.env.ADMIN_EMAIL!);
    await page.getByLabel("密码").fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "进入后台" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/draw");

    await page.getByLabel("奖品").selectOption(prize.id);
    await page.getByLabel("参与主组").selectOption(group.id);
    await page.getByRole("button", { name: "创建轮次" }).click();
    await expect(page.getByText("PREPARING", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "锁定候选名单" }).click();
    await expect(page.getByText("LOCKED", { exact: true })).toBeVisible();
    await expect(page.getByText("3", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "开始抽取" }).click();
    await expect(page.getByText("DRAWN", { exact: true })).toBeVisible();
    const firstRound = await db.drawRound.findFirstOrThrow({ where: { targetGroupId: group.id }, orderBy: { createdAt: "desc" } });
    roundIds.push(firstRound.id);
    const winner = await db.winner.findFirstOrThrow({ where: { roundId: firstRound.id }, include: { guest: true } });
    await expect(screen.getByRole("heading", { name: winner.guest.name })).toBeVisible();

    await page.getByRole("button", { name: "公布中奖结果" }).click();
    await expect(page.getByText("PUBLISHED", { exact: true })).toBeVisible();
    await screen.reload();
    await expect(screen.getByRole("heading", { name: winner.guest.name })).toBeVisible();

    await page.getByRole("button", { name: "新建下一轮" }).click();
    await page.getByRole("button", { name: "创建轮次" }).click();
    await page.getByRole("button", { name: "锁定候选名单" }).click();
    await expect(page.getByText("2", { exact: true })).toBeVisible();
    const secondRound = await db.drawRound.findFirstOrThrow({ where: { targetGroupId: group.id }, orderBy: { createdAt: "desc" } });
    roundIds.push(secondRound.id);
  } finally {
    const winnerIds = (await db.winner.findMany({ where: { roundId: { in: roundIds } }, select: { id: true } })).map((item) => item.id);
    await db.auditEvent.deleteMany({ where: { OR: [{ entityType: "DrawRound", entityId: { in: roundIds } }, { entityType: "Winner", entityId: { in: winnerIds } }, { action: "screen.presence" }] } });
    await db.winner.deleteMany({ where: { roundId: { in: roundIds } } });
    await db.drawCandidateSnapshot.deleteMany({ where: { roundId: { in: roundIds } } });
    await db.drawRound.deleteMany({ where: { id: { in: roundIds } } });
    await db.idempotencyRecord.deleteMany({ where: { scope: { startsWith: "draw:" } } });
    await db.guest.deleteMany({ where: { id: { in: guests.map((guest) => guest.id) } } });
    await db.prizeGroup.deleteMany({ where: { prizeId: prize.id } });
    await db.prize.deleteMany({ where: { id: prize.id } });
    await db.group.deleteMany({ where: { id: group.id } });
  }
});

for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1080 }]) {
  test(`projector fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/screen");
    const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(overflow.width).toBeLessThanOrEqual(overflow.viewport);
    await expect(page.locator("canvas")).toHaveCSS("position", "absolute");
    if (viewport.width === 1920) await page.screenshot({ path: "test-results/screen-1920.png", fullPage: true });
  });
}
