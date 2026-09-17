import { expect, test } from "@playwright/test";

test("refreshes the operations dashboard after a guest registers", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("管理员邮箱").fill(process.env.ADMIN_EMAIL!);
  await page.getByLabel("密码").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "进入后台" }).click();

  await expect(page.getByRole("heading", { name: "婚礼现场概览" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "近 60 分钟登记" })).toBeVisible();

  const total = page.getByTestId("metric-totalGuests");
  const before = Number(await total.textContent());
  const unique = Date.now().toString();
  const response = await page.request.post("/api/registration", {
    headers: { "idempotency-key": `dashboard-live-${unique}` },
    data: {
      name: `实时宾客${unique}`,
      phoneLast4: unique.slice(-4),
      relation: "MUTUAL_FRIEND",
      childCount: 0,
      originProvince: "北京",
      originCity: "北京市",
    },
  });

  expect(response.ok()).toBe(true);
  await expect(total).toHaveText(String(before + 1));
});
