// Verifies the "Share report" flow (docs/PRODUCT-DIFFERENTIATION.md #6,
// marketed as a competitive differentiator over Instrumentl/Candid/etc.)
// actually works end to end in the real V2 grant detail view — this had
// zero test coverage and zero real usage (0 rows in shared_fit_reports)
// before this file existed.
import { expect, test } from "@playwright/test";

test("Share button on the V2 grant detail page creates a working public report link", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();

  await page.goto("/auth");
  await page.getByRole("button", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/grants");
  const firstGrantLink = page.locator('a[href^="/grants/"]').first();
  await expect(firstGrantLink).toBeVisible();
  await firstGrantLink.click();
  await expect(page).toHaveURL(/\/grants\/[^/]+$/);

  const shareButton = page.getByRole("button", { name: /^share$|^creating$|^copied$/i });
  await expect(shareButton).toBeVisible();
  await shareButton.click();
  await expect(shareButton).toHaveText(/copied/i, { timeout: 15_000 });

  const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedUrl).toMatch(/\/report\/[^/]+$/);

  // Open the public link in a completely separate, unauthenticated context —
  // this is the whole point of the feature ("without requiring every
  // stakeholder to have an account").
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(copiedUrl);
  await expect(publicPage.getByText(/fit/i).first()).toBeVisible({ timeout: 15_000 });
  await publicContext.close();
  await context.close();
});
