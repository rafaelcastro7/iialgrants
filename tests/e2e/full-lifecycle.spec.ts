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
  test.setTimeout(10 * 60_000); // several chained LLM calls — the config's 60s default isn't enough.
  // Pre-existing, documented, non-blocking known issue (see "Known issues"
  // in docs/LOCAL-SYSTEM-VERIFICATION.md): rapid programmatic route changes
  // — exactly what this test does — trigger a React "state update on a
  // component that hasn't mounted yet" warning from a shared transition/
  // suspense boundary. It doesn't reproduce at human navigation speed and
  // every page still renders real data with no crash. Filtered here so this
  // known cosmetic warning doesn't mask a real regression appearing
  // alongside it.
  const KNOWN_NONBLOCKING_WARNING = /state update on a component that hasn't mounted yet/i;
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => {
    if (!KNOWN_NONBLOCKING_WARNING.test(error.message)) consoleErrors.push(error.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error" && !KNOWN_NONBLOCKING_WARNING.test(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });

  // 1. Sign in.
  await page.goto("/auth");
  await page.getByRole("button", { name: DEMO_ADMIN }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // 1b. The Writer agent grounds every section in the org's RAG knowledge
  // base (ragRetrieve in writer.functions.ts) and throws no_knowledge_chunks
  // if it's empty — true for a fresh org with no profile saved yet. Fill in
  // the profile and sync it in before touching any grant.
  await page.goto("/org");
  await page.locator('input[name="org_name"]').fill("IIAL Test Org");
  await page.locator('input[name="sectors"]').fill("technology, clean-tech");
  await page.locator('textarea[name="focus_areas"]').fill(
    "We build AI-native software for Canadian small businesses and have delivered three prior applied-research projects with university partners.",
  );
  await page.getByRole("button", { name: /save profile/i }).click();
  await expect(page.getByText(/profile completeness/i)).toBeVisible();

  await page.goto("/proposals");
  await page.getByRole("button", { name: /sync knowledge base/i }).click();
  await expect(page.getByRole("button", { name: /sync knowledge base/i })).toBeEnabled({
    timeout: AGENT_TIMEOUT,
  });

  // 2. Search for the seeded grant. "Open radar" only exists on /dashboard —
  // the sync step above leaves us on /proposals.
  await page.goto("/dashboard");
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
    const enrichSheet = page.getByRole("dialog", { name: /chain of thought/i });
    if (await enrichSheet.isVisible().catch(() => false)) {
      await enrichSheet.getByRole("button", { name: /close/i }).click();
      await expect(enrichSheet).toBeHidden();
      await expect(page).not.toHaveURL(/[?&]run=/);
    }
  }

  // 4. Evaluate fit. This opens the "Chain of thought" trace Sheet (its
  // open/closed state is mirrored into the URL's ?run= param — see
  // closeTrace() in _authenticated.grants.$id.tsx), which intercepts clicks
  // on everything behind it until dismissed.
  const evaluateButton = page.getByRole("button", { name: /check fit|re-evaluate fit/i });
  await expect(evaluateButton).toBeVisible();
  await evaluateButton.click();
  await expect(page.getByRole("button", { name: /re-evaluate fit/i })).toBeVisible({
    timeout: AGENT_TIMEOUT,
  });
  const traceSheet = page.getByRole("dialog", { name: /chain of thought/i });
  await traceSheet.getByRole("button", { name: /close/i }).click();
  await expect(traceSheet).toBeHidden();
  // closeTrace() clears the ?run= query param via an async navigate() — wait
  // for it to actually land instead of racing it, otherwise a re-render can
  // read the still-stale URL and reopen the sheet right under the next click.
  await expect(page).not.toHaveURL(/[?&]run=/);
  expect(consoleErrors, `Console errors after evaluate: ${consoleErrors.join("; ")}`).toEqual([]);

  // 5. Draft a proposal — or open the one a previous run already created for
  // this grant (V2GrantDetail.tsx shows "Open proposal" instead of "Draft
  // proposal" once existingProposalId is set; re-running this test against
  // the same seeded grant hits that branch, not a fresh draft every time).
  const draftButton = page.getByRole("button", { name: /draft proposal/i });
  const openProposalLink = page.getByRole("link", { name: /open proposal/i });
  if (await openProposalLink.isVisible().catch(() => false)) {
    await openProposalLink.click();
  } else {
    await expect(draftButton).toBeEnabled({ timeout: AGENT_TIMEOUT });
    await draftButton.click();
  }
  await expect(page).toHaveURL(/\/proposals\/[^/]+$/, { timeout: AGENT_TIMEOUT });

  // 6. The Express proposal view is deliberately "ONE primary action at a
  // time" (see ProposalDetailExpress.tsx): a freshly-drafted proposal starts
  // with every section Empty, so the first action is `Draft "<heading>"`,
  // repeated per section, before quality review or submit ever appear.
  const primaryAction = page.getByRole("button").filter({ hasText: /^Draft "|^Run quality review|^Submit proposal$/ });
  for (let i = 0; i < 12; i++) {
    const label = await primaryAction.textContent();
    if (!label?.startsWith('Draft "')) break;
    await primaryAction.click();
    await expect(primaryAction).not.toHaveText(label, { timeout: AGENT_TIMEOUT });
  }

  // 7. Run quality review (the critic) once every section is drafted. Its
  // schema is more complex than the evaluator's, and a provider whose output
  // fails that schema makes the chain advance to the next one (see
  // docs/LOCAL-SYSTEM-VERIFICATION.md) — comfortably slower than a single
  // call, hence the longer allowance here specifically.
  const CRITIC_TIMEOUT = 150_000;
  await expect(primaryAction).toHaveText(/run quality review/i, { timeout: AGENT_TIMEOUT });
  await primaryAction.click();
  await expect(primaryAction).not.toHaveText(/run quality review/i, { timeout: CRITIC_TIMEOUT });
  expect(consoleErrors, `Console errors after critic: ${consoleErrors.join("; ")}`).toEqual([]);

  // 8. Export + submit only exist in the Advanced view.
  await page.getByRole("button", { name: /show full details/i }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: AGENT_TIMEOUT }),
    page.getByRole("button", { name: /export.*md|markdown/i }).click(),
  ]);
  expect(download.suggestedFilename()).toBeTruthy();

  // 9. Submit — proposal is freshly drafted, so this should hit the
  // readiness gate (not silently succeed, not silently fail).
  await page.getByRole("button", { name: /^submit$/i }).click();
  const forceSubmit = page.getByRole("button", { name: /submit anyway/i });
  const submitForm = page.getByRole("dialog");
  await expect(forceSubmit.or(submitForm)).toBeVisible({ timeout: 15_000 });
});
