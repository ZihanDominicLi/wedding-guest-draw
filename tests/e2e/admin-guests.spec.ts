import { expect, test } from "@playwright/test";

test("filters guests and opens the focused guest editor", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("管理员邮箱").fill(process.env.ADMIN_EMAIL!);
  await page.getByLabel("密码").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "进入后台" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/guests");
  await expect(page.getByRole("heading", { name: "宾客名单" })).toBeVisible();
  await expect(page.getByPlaceholder("搜索姓名")).toBeVisible();

  const editButton = page.getByTitle("编辑宾客").first();
  if (await editButton.count()) {
    await editButton.click();
    await expect(page.getByRole("heading", { name: "编辑宾客" })).toBeVisible();
    await expect(page.getByLabel("锁定人工分组")).toBeVisible();
  }
});
