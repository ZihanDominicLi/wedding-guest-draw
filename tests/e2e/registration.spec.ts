import { expect, test } from "@playwright/test";

test("guides a guest through on-site registration", async ({ page }) => {
  await page.goto("/join");

  await expect(page.getByText("第 1 步，共 3 步")).toBeVisible();
  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByText("请填写姓名")).toBeVisible();

  await page.getByLabel("姓名").fill("周青");
  await page.getByLabel("手机号后四位").fill("7788");
  await page.getByLabel("与新人的关系").selectOption("MUTUAL_FRIEND");
  await page.getByRole("button", { name: "下一步" }).click();

  await page.getByLabel("携带小朋友").check();
  await expect(page.getByLabel("小朋友人数")).toBeVisible();
  await page.getByLabel("小朋友人数").fill("1");
  await page.getByRole("button", { name: "下一步" }).click();

  await page.getByLabel("出发省份").fill("广东");
  await page.getByLabel("出发城市").fill("深圳市");
  await page.getByRole("button", { name: "确认登记" }).click();

  await expect(page.getByRole("heading", { name: "登记成功" })).toBeVisible();
  await expect(page.getByText("亲子宾客组")).toBeVisible();
  await expect(page.getByText(/现场编号/)).toBeVisible();
});

test("restores an unfinished local draft", async ({ page }) => {
  await page.goto("/join");
  await page.evaluate(() => {
    localStorage.setItem(
      "wedding-registration-draft:v1",
      JSON.stringify({
        step: 2,
        name: "草稿宾客",
        phoneLast4: "1122",
        relation: "CLASSMATE",
        childCount: 0,
        originProvince: "",
        originCity: "",
        idempotencyKey: "browser-draft-123456",
      }),
    );
  });
  await page.reload();

  await expect(page.getByText("第 2 步，共 3 步")).toBeVisible();
  await page.getByRole("button", { name: "上一步" }).click();
  await expect(page.getByLabel("姓名")).toHaveValue("草稿宾客");
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`fits the ${viewport.width}x${viewport.height} registration viewport`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/join");

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);

    const controls = page.locator("input:visible, select:visible, button:visible");
    for (let index = 0; index < (await controls.count()); index += 1) {
      const box = await controls.nth(index).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    if (viewport.width === 390) {
      await page.screenshot({
        path: "test-results/join-390.png",
        fullPage: true,
      });
    }
  });
}
