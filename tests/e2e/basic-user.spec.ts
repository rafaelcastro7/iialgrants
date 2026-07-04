import { expect, test, type Page } from "@playwright/test";

const DEMO_MEMBER = "Member A";

async function basicUserFlow(page: Page) {
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/auth");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.getByText(/demo autologin/i)).toBeVisible();

  await page.getByRole("button", { name: DEMO_MEMBER }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /browse grants/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  await expect(page.getByText(/next best step/i)).toBeVisible();

  await page.getByRole("link", { name: /browse grants/i }).click();
  await expect(page).toHaveURL(/\/grants\/?$/);
  await expect(page.getByRole("tab", { name: "Express" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Advanced" })).toBeVisible();

  await page.getByRole("tab", { name: "Advanced" }).click();
  await expect(page.getByLabel("Search grants")).toBeVisible();
  await expect(page.getByText(/workflow/i)).toBeVisible();

  expect(consoleErrors).toEqual([]);
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
}

test.describe("basic user flow", () => {
  test("desktop user can reach the grants workspace", async ({ page }) => {
    await basicUserFlow(page);
  });
});

test.describe("basic user mobile flow", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile user stays within viewport", async ({ page }) => {
    await basicUserFlow(page);
    await assertNoHorizontalOverflow(page);
  });
});
