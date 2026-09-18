import { expect, test } from "@playwright/test";

test("shows wedding settings and the canonical registration QR", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/login");
  await page.getByLabel("管理员邮箱").fill(process.env.ADMIN_EMAIL!);
  await page.getByLabel("密码").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "进入后台" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/settings");
  await expect(
    page.getByRole("heading", { name: "婚礼与登记设置" }),
  ).toBeVisible();
  await expect(page.locator(".qr-output canvas")).toBeVisible();
  const registrationUrl = new URL("/join", process.env.BETTER_AUTH_URL!).toString();
  await expect(page.getByText(registrationUrl)).toBeVisible();
  await page.screenshot({
    path: "test-results/settings-desktop.png",
    fullPage: true,
  });
});
