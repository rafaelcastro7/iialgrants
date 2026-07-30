// Full human-style walkthrough of the grant lifecycle: search a grant,
// enrich it, evaluate fit, draft a proposal, run the critic, export, and
// submit. Exists to catch integration breaks across the whole pipeline that
// route-by-route or unit tests can't see (e.g. an agent call that succeeds in
// isolation but the UI never re-fetches to show its result).
import { expect, test } from "@playwright/test";

const DEMO_ADMIN = "Admin";
const AGENT_TIMEOUT = 90_000; // LLM calls (cloud or local) can take a while.

test.describe.configure({ mode: "serial" });

test("search → enrich → evaluate → draft → critic → export → submit", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // 1. Sign in.
  await page.goto("/auth");
  await page.getByRole("button", { name: DEMO_ADMIN }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // 2. Search for the seeded grant.
  await page.getByRole("link", { name: /open radar/i }).click();
  await expect(page).toHaveURL(/\/grants\/?$/);
  await page.getByRole("searchbox", { name: /search grants/i }).fill("IRAP");
  const grantLink = page.getByRole("link", {
    name: "Industrial Research Assistance Program (IRAP)",
    exact: true,
  });
  await expect(grantLink).toBeVisible();
  await grantLink.click();
  await expect(page).toHaveURL(/\/grants\/[^/]+$/);

  // 3. Enrich (if the action is offered — grant starts as "discovered").
  const fetchDetails = page.getByRole("button", { name: /fetch details/i });
  if (await fetchDetails.isVisible().catch(() => false)) {
    await fetchDetails.click();
    await expect(page.getByRole("button", { name: /fetch details/i })).toBeEnabled({
      timeout: AGENT_TIMEOUT,
    });
  }

  // 4. Evaluate fit.
  const evaluateButton = page.getByRole("button", { name: /check fit|re-evaluate fit/i });
  await expect(evaluateButton).toBeVisible();
  await evaluateButton.click();
  await expect(page.getByRole("button", { name: /re-evaluate fit/i })).toBeVisible({
    timeout: AGENT_TIMEOUT,
  });
  expect(consoleErrors, `Console errors after evaluate: ${consoleErrors.join("; ")}`).toEqual([]);

  // 5. Draft a proposal.
  const draftButton = page.getByRole("button", { name: /draft proposal/i });
  const openProposal = page.getByRole("link", { name: /open proposal/i });
  if (await draftButton.isVisible().catch(() => false)) {
    await draftButton.click();
  }
  await expect(page).toHaveURL(/\/proposals\/[^/]+$/, { timeout: AGENT_TIMEOUT });

  // 6. Run the critic.
  const criticButton = page.getByRole("button", { name: /run critic/i });
  await expect(criticButton).toBeVisible({ timeout: AGENT_TIMEOUT });
  await criticButton.click();
  await expect(page.getByText(/\d+%/)).toBeVisible({ timeout: AGENT_TIMEOUT });

  // 7. Export (Markdown — cheapest, deterministic format to verify the export
  // pipeline fires a real request rather than every renderer variant).
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: AGENT_TIMEOUT }),
    page.getByRole("button", { name: /export.*md|markdown/i }).click(),
  ]);
  expect(download.suggestedFilename()).toBeTruthy();

  // 8. Submit — proposal is freshly drafted, so this should hit the
  // readiness gate (not silently succeed, not silently fail).
  await page.getByRole("button", { name: /^submit$/i }).click();
  const forceSubmit = page.getByRole("button", { name: /submit anyway/i });
  const submitForm = page.getByRole("dialog");
  await expect(forceSubmit.or(submitForm)).toBeVisible({ timeout: 15_000 });
});
