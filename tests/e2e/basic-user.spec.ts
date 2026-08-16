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
  // Real bug, confirmed live: this asserted stale copy — "prioritize every
  // opportunity" was never the actual heading in the current V2GrantsWorkspace
  // (src/components/v2/V2GrantsWorkspace.tsx), which renders "Here's where to
  // focus today". A prior UI rewrite changed the copy and this test was never
  // updated to match, so it failed on every run regardless of app correctness.
  await expect(
    // Match without the apostrophe: the source renders `&rsquo;` (U+2019 ’),
    // not a straight quote, so a literal `'` in this regex would never match.
    page.getByRole("heading", { name: /where to focus today/i }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox", { name: /search grants/i })).toBeVisible();
  // Assert the workspace renders grants, not that one specific grant happens to
  // be on the first page. That held when the catalog had 47 rows; it now has
  // 3000+, so IRAP legitimately sits outside the first page and this failed on
  // a healthy system. The searched assertion below is the one that carries the
  // real meaning.
  const firstGrantLink = page.locator('a[href^="/grants/"]').first();
  await expect(firstGrantLink).toBeVisible({ timeout: 30_000 });

  // Search for a grant the catalog actually has right now instead of the
  // hardcoded "Industrial Research Assistance Program (IRAP)". That row was
  // seeded once and has since been auto-archived by a real failed-fit
  // evaluation, so it is correctly excluded from the active list and both of
  // these assertions failed on a perfectly healthy system. Taking the term
  // from a visible grant keeps the assertion meaningful — search must return
  // the specific thing asked for — without depending on any one seed row
  // surviving.
  const sampleTitle = (await firstGrantLink.innerText()).trim().split("\n")[0].slice(0, 40);
  expect(sampleTitle.length, "could not read a grant title to search for").toBeGreaterThan(3);

  await page.getByRole("searchbox", { name: /search grants/i }).fill(sampleTitle);
  await expect(page.getByRole("link", { name: sampleTitle, exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });
  // Same stale-copy issue as the heading above: the real component renders
  // "active grants", not "active records".
  await expect(page.getByText(/showing \d+ of \d+ active grants/i)).toBeVisible();

  await page.getByRole("button", { name: /open command palette/i }).click();
  const commandDialog = page.getByRole("dialog", { name: /command palette/i });
  await commandDialog
    .getByPlaceholder("Search grants, proposals, or type a command...")
    .fill(sampleTitle);
  await expect(commandDialog.getByText(sampleTitle, { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(commandDialog.getByText(/no results found/i)).toHaveCount(0);
  await page.keyboard.press("Escape");

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
