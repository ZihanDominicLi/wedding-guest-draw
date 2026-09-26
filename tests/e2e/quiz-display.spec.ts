import { expect, test } from "@playwright/test";

test("stacks mobile quiz choices as large tappable buttons", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/quiz/current", (route) =>
    route.fulfill({
      json: { data: { session: { id: "quiz-mobile", title: "婚礼现场答题" } } },
    }),
  );
  await page.route("**/api/quiz/quiz-mobile/participant", (route) =>
    route.fulfill({
      json: {
        data: {
          session: { status: "LIVE", currentQuestionIndex: 1, questionCount: 7 },
          question: {
            id: "question-1",
            order: 1,
            prompt: "新娘的名字是？",
            options: ["邓廷月", "邓婷月", "邓婷日", "邓月"],
            closesAt: new Date(Date.now() + 30_000).toISOString(),
          },
          participant: { score: 0, status: "ACTIVE", currentAnswer: null },
        },
      },
    }),
  );

  await page.goto("/quiz");

  const list = page.locator(".choice-list");
  const choices = page.locator(".choice");
  await expect(choices).toHaveCount(4);
  await expect(list).toHaveCSS("display", "grid");
  const columns = await list.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(1);

  const firstChoice = choices.first();
  const box = await firstChoice.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(320);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
  await firstChoice.click();
  await expect(firstChoice).toHaveClass(/selected/);
});

test("shows a quiz-only projector even when a draw round is active", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route("**/api/events/screen", (route) => route.abort());
  await page.route("**/api/screen", (route) =>
    route.fulfill({
      json: {
        data: {
          settings: { screenTitle: "婚礼现场", screenBackgroundPath: "/uploads/wedding-background-test.jpg" },
          quiz: {
            id: "quiz-projector",
            status: "LIVE",
            currentQuestionIndex: 1,
            question: {
              id: "question-1",
              order: 1,
              prompt: "新娘的名字是？",
              options: ["邓廷月", "邓婷月", "邓婷日", "邓月"],
              closesAt: new Date(Date.now() + 30_000).toISOString(),
            },
          },
          round: {
            id: "draw-round",
            status: "LOCKED",
            version: 1,
            prizeName: "测试奖品",
            prizeImagePath: null,
            groupName: "现场宾客组",
            candidates: ["抽奖候选宾客"],
            winners: [],
          },
        },
      },
    }),
  );

  await page.goto("/quiz/screen");

  await expect(page.getByRole("heading", { name: "新娘的名字是？" })).toBeVisible();
  await expect(page.getByText("邓廷月", { exact: true })).toBeVisible();
  await expect(page.getByText("测试奖品", { exact: true })).toHaveCount(0);
  await expect(page.getByText("抽奖候选宾客", { exact: true })).toHaveCount(0);
  await expect(page.locator(".candidate-field, .winner-reveal, .projector-idle")).toHaveCount(0);

  const background = page.locator(".projector-backdrop");
  await expect(background).toHaveCSS("filter", "blur(4px)");
  await expect(background).toHaveAttribute("style", /wedding-background-test\.jpg/);
  await expect(page.locator(".quiz-projector-content")).toHaveCSS("filter", "none");
});
