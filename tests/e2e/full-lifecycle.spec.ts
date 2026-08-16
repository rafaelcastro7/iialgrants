// Full human-style walkthrough of the grant lifecycle: search a grant,
// enrich it, evaluate fit, draft a proposal, run the critic, export, and
// submit. Exists to catch integration breaks across the whole pipeline that
// route-by-route or unit tests can't see (e.g. an agent call that succeeds in
// isolation but the UI never re-fetches to show its result).
import { expect, test } from "@playwright/test";

const DEMO_ADMIN = "Admin";
// Must be >= the real configured ceiling, not a guess: llm-timeouts.server.ts's
// SLOW_AGENT_TIMEOUT_FLOORS_MS gives enricher/evaluator/strategist/critic a
// real 300s floor (writer gets 600s). This was 90_000 and intermittently
// failed waiting on a legitimately slow-but-working live enrichment call
// (scraping a real external funder site, not a hang) -- confirmed live
// 2026-08-01 against a freshly rebuilt stack: the same "verify the actual
// configured timeout before calling something a hang" lesson this project
// already learned once with Ollama, recurring here with a shorter margin.
const AGENT_TIMEOUT = 320_000;

test.describe.configure({ mode: "serial" });

test("search → enrich → evaluate → draft → critic → export → submit", async ({ page }) => {
  test.setTimeout(20 * 60_000); // several chained slow-agent-floor LLM calls in series.
  // Pre-existing, documented, non-blocking known issue (see "Known issues"
  // in docs/LOCAL-SYSTEM-VERIFICATION.md): rapid programmatic route changes
  // — exactly what this test does — trigger a React "state update on a
  // component that hasn't mounted yet" warning from a shared transition/
  // suspense boundary. It doesn't reproduce at human navigation speed and
  // every page still renders real data with no crash. Filtered here so this
  // known cosmetic warning doesn't mask a real regression appearing
  // alongside it.
  // Second known-benign pattern: this test's own setup phase does several
  // full page.goto() calls back to back — every page load fires a session
  // check (SupabaseAuthClient.getUser()) whose fetch gets aborted by the
  // *next* navigation if it hasn't resolved yet. That's the browser
  // correctly cancelling in-flight work for a document that's going away,
  // not a real connectivity failure (confirmed live: Docker/Kong/app all
  // healthy immediately after this fired). A genuine outage would show up
  // as sustained request failures well beyond just this one signature.
  const KNOWN_NONBLOCKING_WARNING =
    /state update on a component that hasn't mounted yet|Failed to fetch.*SupabaseAuthClient\.getUser|SupabaseAuthClient\.getUser.*Failed to fetch/is;
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
  // Fail fast on a crashed page. Without this, a route that renders the error
  // boundary (e.g. right after a Vite dep-optimizer cache clear, when the dev
  // server is mid-recompile) burns the entire 20-minute test budget inside
  // locator.click() waiting for a button that is never going to exist, and
  // reports it as "waiting for getByRole('button', {name: 'Admin'})" -- which
  // says nothing about the actual failure. Confirmed live 2026-08-16.
  await expect(
    page.getByRole("heading", { name: /this page didn't load/i }),
    "the app rendered its error boundary instead of the sign-in page - check the dev server log",
  ).toBeHidden({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: DEMO_ADMIN }),
    "demo autologin buttons are DEV-only (import.meta.env.DEV in auth.tsx) - is the app running via `bun run dev`?",
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: DEMO_ADMIN }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // 1b. The Writer agent grounds every section in the org's RAG knowledge
  // base (ragRetrieve in writer.functions.ts) and throws no_knowledge_chunks
  // if it's empty — true for a fresh org with no profile saved yet. Fill in
  // the profile and sync it in before touching any grant.
  await page.goto("/org");
  await page.locator('input[name="org_name"]').fill("IIAL Test Org");
  await page.locator('input[name="sectors"]').fill("technology, clean-tech");
  await page
    .locator('textarea[name="focus_areas"]')
    .fill(
      "We build AI-native software for Canadian small businesses and have delivered three prior applied-research projects with university partners.",
    );
  await page.getByRole("button", { name: /save profile/i }).click();
  await expect(page.getByText(/profile completeness/i)).toBeVisible();

  await page.goto("/proposals");
  await page.getByRole("button", { name: /sync knowledge base/i }).click();
  await expect(page.getByRole("button", { name: /sync knowledge base/i })).toBeEnabled({
    timeout: AGENT_TIMEOUT,
  });

  // 2. Open a real discovered grant, unfiltered. "Open radar" only exists
  // on /dashboard — the sync step above leaves us on /proposals.
  //
  // Deliberately NOT scoped to any one funder/program title: real discovery
  // runs against live external pages, and both a specific program's title
  // and whether it survives evaluation (auto-archived on a failed fit
  // re-evaluation) can change between runs. Confirmed live 2026-08-01, in
  // order: (a) a grant hard-pinned to one exact title got auto-archived by
  // a real, correct auto_archive_on_fail evaluation after unrelated manual
  // DB surgery gave it mismatched content; (b) switching to search
  // "Mitacs" just moved the fragility to one funder whose real page
  // produces malformed JSON on enrichment (a live-site scraping issue, not
  // an app bug) -- repeated runs kept re-attempting enrichment on the same
  // stuck grant until it exhausted MAX_ENRICH_ATTEMPTS. Taking whatever the
  // catalog's default ordering surfaces first removes the dependency on
  // any single external funder's site behaving today.
  //
  // Still not pinned to a funder or a program title — but no longer "whatever
  // sorts first" either. The catalog now leads with Canadian programs, and the
  // first of those was a Mitacs student internship: the evaluator correctly
  // returned eligibility_pass=false for an SME applying to a grant restricted
  // to undergraduates, which leaves "Draft proposal" disabled and the rest of
  // the lifecycle unreachable (confirmed live 2026-08-16). Searching a term
  // aligned with the seeded org profile (SME, technology, R&D) picks a grant
  // the org can plausibly win, without hardcoding which one that is.
  await page.goto("/dashboard");
  await page.getByRole("link", { name: /open radar/i }).click();
  await expect(page).toHaveURL(/\/grants\/?$/);
  const grantSearch = page.getByRole("searchbox", { name: /search grants/i });
  await expect(grantSearch).toBeVisible();
  await grantSearch.fill("innovation research and development for small business");
  const grantLink = page.locator('a[href^="/grants/"]').first();
  await expect(grantLink).toBeVisible({ timeout: 60_000 });
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
    // An honest "not eligible" verdict is a legitimate evaluator outcome, and
    // it leaves this button disabled permanently: evaluator.impl.server.ts
    // only promotes a grant to "scored" (which is what canDraft requires) when
    // eligibility_pass is true. Detect that here instead of sitting in
    // toBeEnabled() for the full agent timeout and then reporting nothing more
    // useful than "unexpected value disabled" — confirmed live 2026-08-16,
    // where it burned 320s on a grant scored 0.30 / eligibility_pass=false.
    const blockedReason = page.getByText(/assessed as not eligible|drafting unlocks once/i);
    if (await blockedReason.isVisible().catch(() => false)) {
      const reason = await blockedReason.innerText();
      throw new Error(
        `Grant is not draftable, so the rest of the lifecycle cannot run: "${reason}". ` +
          `Seed or pick a grant the evaluator passes (eligibility_pass=true) for this test.`,
      );
    }
    await expect(draftButton).toBeEnabled({ timeout: AGENT_TIMEOUT });
    await draftButton.click();
  }
  await expect(page).toHaveURL(/\/proposals\/[^/]+$/, { timeout: AGENT_TIMEOUT });

  // 6. The Express proposal view is deliberately "ONE primary action at a
  // time" (see ProposalDetailExpress.tsx): a freshly-drafted proposal starts
  // with every section Empty, so the first action is `Draft "<heading>"`,
  // repeated per section, before quality review or submit ever appear.
  // Must match every state the button's text cycles through, not just the
  // at-rest labels — while a click is pending it swaps to "Drafting…" /
  // "Reviewing…" / "Submitting…" (ProposalDetailExpress.tsx), and a filter
  // that only matches the at-rest text stops resolving to any element at all
  // the instant you click it.
  const primaryAction = page.getByRole("button").filter({
    hasText: /^Draft "|^Drafting…|^Run quality review|^Reviewing…|^Submit proposal$|^Submitting…/,
  });
  // writer's real configured floor is 600s (vs. 300s for the other slow
  // agents) -- give each section draft that same real ceiling rather than
  // AGENT_TIMEOUT, for the same "match the actual configured allowance"
  // reason AGENT_TIMEOUT itself was raised above.
  const WRITER_TIMEOUT = 620_000;
  for (let i = 0; i < 12; i++) {
    const label = await primaryAction.textContent();
    if (!label?.startsWith('Draft "')) break;
    await primaryAction.click();
    await expect(primaryAction).not.toHaveText(label, { timeout: WRITER_TIMEOUT });
  }

  // 7. Run quality review (the critic) once every section is drafted. Its
  // schema is more complex than the evaluator's, and a provider whose output
  // fails that schema makes the chain advance to the next one (see
  // docs/LOCAL-SYSTEM-VERIFICATION.md) — comfortably slower than a single
  // call, hence the longer allowance here specifically.
  //
  // This does NOT reliably land on "Submit proposal" next: canSubmit()
  // (submit-gate.shared.ts) also requires zero open critical requirements,
  // and IRAP's page lists "Financial statements required" — a real document
  // upload this pipeline can't satisfy by drafting or reviewing text. A
  // passing critic score with that requirement still open correctly re-shows
  // "Run quality review" (the ladder's fallback when neither ready-to-submit
  // nor a next-empty-section applies), not a bug. Assert the review actually
  // ran by its side effect (pending flag clearing), not by which button text
  // comes next, then head to Advanced for the real submit gate regardless.
  // critic's real configured floor is 300s, same as evaluator -- was
  // 150_000 (half of that), the same class of too-short test patience
  // fixed for AGENT_TIMEOUT above.
  const CRITIC_TIMEOUT = 320_000;
  await expect(primaryAction).toHaveText(/run quality review/i, { timeout: AGENT_TIMEOUT });
  await primaryAction.click();
  await expect(primaryAction).toBeDisabled({ timeout: 5_000 }); // mutation started
  await expect(primaryAction).toBeEnabled({ timeout: CRITIC_TIMEOUT }); // mutation finished
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
