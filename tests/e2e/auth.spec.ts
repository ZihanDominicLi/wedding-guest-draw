import { expect, test } from "@playwright/test";

test("protects the admin dashboard and accepts the seeded administrator", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?from=%2Fadmin$/);

  await page.getByLabel("管理员邮箱").fill(process.env.ADMIN_EMAIL!);
  await page.getByLabel("密码").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "进入后台" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: /欢迎回来/ })).toBeVisible();
});
