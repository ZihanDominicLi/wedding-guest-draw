import { expect, test } from "@playwright/test";

import { db } from "@/lib/db";

test("creates, edits, and disables a prize", async ({ page }) => {
  const marker = `浏览器奖品${Date.now()}`;
  const group = await db.group.findFirstOrThrow({ where: { enabled: true }, orderBy: { sortOrder: "asc" } });
  let prizeId = "";
  try {
    await page.goto("/login");
    await page.getByLabel("管理员邮箱").fill(process.env.ADMIN_EMAIL!);
    await page.getByLabel("密码").fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "进入后台" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/prizes");

    await page.getByRole("button", { name: "添加奖品" }).click();
    await page.getByLabel("奖品名称").fill(marker);
    await page.getByLabel("计划中奖人数").fill("2");
    await page.getByLabel(group.name).check();
    await page.getByRole("button", { name: "保存奖品" }).click();
    await expect(page.getByText(marker, { exact: true })).toBeVisible();
    prizeId = (await db.prize.findFirstOrThrow({ where: { name: marker } })).id;

    const row = page.locator(".prize-row").filter({ hasText: marker });
    await row.getByTitle("编辑奖品").click();
    await page.getByLabel("计划中奖人数").fill("3");
    await page.getByRole("button", { name: "保存奖品" }).click();
    await expect(row).toContainText("3 个名额");

    page.once("dialog", (dialog) => dialog.accept());
    await row.getByTitle("停用奖品").click();
    await expect(row).toContainText("已停用");
  } finally {
    if (prizeId) {
      await db.auditEvent.deleteMany({ where: { entityType: "Prize", entityId: prizeId } });
      await db.prizeGroup.deleteMany({ where: { prizeId } });
      await db.prize.deleteMany({ where: { id: prizeId } });
    }
  }
});
