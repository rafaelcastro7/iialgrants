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

  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.getByText(/demo autologin/i)).toBeVisible();

  await page.getByRole("button", { name: DEMO_MEMBER }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: /run the grant operation from one place/i }),
  ).toBeVisible();
  await expect(page.getByText(/next best action/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /open radar/i })).toBeVisible();

  // Desktop-only: the full sidebar exposes sign-out directly in the V2 shell.
  const isDesktop = page.viewportSize()?.width && page.viewportSize()!.width >= 768;
  if (isDesktop) {
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  }

  await page.getByRole("link", { name: /open radar/i }).click();
  await expect(page).toHaveURL(/\/grants\/?$/);
  await expect(page.getByRole("heading", { name: /prioritize every opportunity/i })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: /search grants/i })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Industrial Research Assistance Program (IRAP)", exact: true }),
  ).toBeVisible();

  await page.getByRole("searchbox", { name: /search grants/i }).fill("IRAP");
  await expect(
    page.getByRole("link", { name: "Industrial Research Assistance Program (IRAP)", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/showing \d+ of \d+ active records/i)).toBeVisible();

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
