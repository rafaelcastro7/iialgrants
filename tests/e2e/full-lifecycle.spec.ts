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
  //
  // The query has to carry the profile's *jurisdiction* too, not just its
  // sector: grant search ranks on text relevance plus a Canada-first nudge and
  // never consults org_profiles.jurisdictions, so a bare "small business
  // innovation" search put "Innovation PEI Small Business Assistance" first
  // and the evaluator rightly failed it for an org registered in CA/ON/QC.
  await page.goto("/dashboard");
  await page.getByRole("link", { name: /open radar/i }).click();
  await expect(page).toHaveURL(/\/grants\/?$/);

  const SEARCH_QUERY = "Southern Ontario innovation growth for technology companies";
  // "Not eligible" is a *correct* evaluator answer, not a failure — and which
  // grant sorts first shifts between runs as earlier ones get scored, archived
  // or submitted. Betting the whole lifecycle on candidate #0 therefore passed
  // or failed by luck. Walk candidates in order until one is actually
  // draftable, and report every rejection with the evaluator's own reasoning
  // if none of them are.
  const MAX_CANDIDATES = 3;

  async function openCandidate(index: number): Promise<string> {
    await page.goto("/grants");
    const search = page.getByRole("searchbox", { name: /search grants/i });
    await expect(search).toBeVisible();
    await search.fill(SEARCH_QUERY);
    const link = page.locator('a[href^="/grants/"]').nth(index);
    await expect(link).toBeVisible({ timeout: 60_000 });
    await link.click();
    await expect(page).toHaveURL(/\/grants\/[^/]+$/);
    return (await page.getByRole("heading", { level: 1 }).first().innerText()).trim();
  }

  // Held for the final assertion, so "submitted" is verified against the grant
  // this run actually walked through rather than whatever sorts first later.
  let grantTitle = "";
  const rejections: string[] = [];

  for (let candidate = 0; candidate < MAX_CANDIDATES; candidate++) {
    grantTitle = await openCandidate(candidate);
    expect(grantTitle.length, "could not read the grant title").toBeGreaterThan(0);

    // 3. Enrich (if the action is offered — grant starts as "discovered").
    const fetchDetails = page.getByRole("button", { name: /fetch details/i });
    if (await fetchDetails.isVisible().catch(() => false)) {
      await fetchDetails.click();
      // Same modal-dialog ordering as the evaluate step below: close the trace
      // Sheet first, because while it is open the button behind it is
      // aria-hidden and no assertion against it can ever pass.
      const enrichSheet = page.getByRole("dialog", { name: /chain of thought/i });
      if (await enrichSheet.isVisible({ timeout: 30_000 }).catch(() => false)) {
        await enrichSheet.getByRole("button", { name: /close/i }).click();
        await expect(enrichSheet).toBeHidden();
        await expect(page).not.toHaveURL(/[?&]run=/);
      }
      // Deliberately no assertion on "Fetch details" here. On a *successful*
      // enrichment the grant leaves "discovered", canFetch goes false and the
      // button is unmounted entirely — so waiting for it to re-enable fails
      // with "element(s) not found" precisely when enrichment worked. The step
      // below waits for "Check fit" to become enabled, which is the state
      // enrichment was run to reach, and covers the scrape-failed path too.
    }

    // 4. Evaluate fit. Already-evaluated candidates show "Re-evaluate fit";
    // spending another LLM call on them adds nothing, so only run the agent
    // when this grant has no verdict yet.
    const alreadyEvaluated = await page
      .getByRole("button", { name: /re-evaluate fit/i })
      .isVisible()
      .catch(() => false);

    if (!alreadyEvaluated) {
      const evaluateButton = page.getByRole("button", { name: /check fit/i });
      await expect(evaluateButton).toBeVisible();
      // Assert enabled *before* clicking. Enrichment legitimately fails on
      // grants whose recorded page has moved (scrape_failed: http_404 is a
      // live outcome, not a bug), and a click on a disabled button just sits
      // in Playwright's actionability wait until the whole test times out —
      // 22 minutes for "waiting for element to be visible, enabled and
      // stable", which says nothing about why. Confirmed live 2026-08-16.
      await expect(
        evaluateButton,
        "Check fit stayed disabled - the grant has no summary and its page could not be fetched",
      ).toBeEnabled({ timeout: AGENT_TIMEOUT });
      await evaluateButton.click();

      // Dismiss the trace Sheet BEFORE waiting for the button label to flip.
      // The Sheet is a modal Radix dialog: while it is open the rest of the
      // page is aria-hidden, so "Re-evaluate fit" is not just covered but
      // absent from the accessibility tree, and toBeVisible() can never
      // succeed. Waiting first burned the full 320s agent timeout and reported
      // only "waiting for getByRole('button', {name: /re-evaluate fit/i})" —
      // confirmed live 2026-08-16 from the failure snapshot, which contained
      // nothing but the dialog itself. The agent keeps running server-side
      // after the Sheet closes, so the assertion below still covers the wait.
      const traceSheet = page.getByRole("dialog", { name: /chain of thought/i });
      await expect(traceSheet).toBeVisible({ timeout: 60_000 });
      await traceSheet.getByRole("button", { name: /close/i }).click();
      await expect(traceSheet).toBeHidden();
      // closeTrace() clears the ?run= query param via an async navigate() —
      // wait for it to land instead of racing it, otherwise a re-render can
      // read the stale URL and reopen the sheet under the next click.
      await expect(page).not.toHaveURL(/[?&]run=/);
      await expect(page.getByRole("button", { name: /re-evaluate fit/i })).toBeVisible({
        timeout: AGENT_TIMEOUT,
      });
    }
    expect(consoleErrors, `Console errors after evaluate: ${consoleErrors.join("; ")}`).toEqual([]);

    // 5. Draft a proposal — or open the one a previous run already created for
    // this grant (V2GrantDetail.tsx shows "Open proposal" instead of "Draft
    // proposal" once existingProposalId is set; re-running this test against
    // the same grant hits that branch, not a fresh draft every time).
    const openProposalLink = page.getByRole("link", { name: /open proposal/i });
    if (await openProposalLink.isVisible().catch(() => false)) {
      await openProposalLink.click();
      break;
    }

    const draftButton = page.getByRole("button", { name: /draft proposal/i });
    if (await draftButton.isEnabled().catch(() => false)) {
      await draftButton.click();
      break;
    }

    // Not draftable: record why (the page now states it — see
    // draftBlockedReason in V2GrantDetail.tsx) and move to the next candidate.
    const blockedReason = page.getByText(/assessed as not eligible|drafting unlocks once/i);
    const reason = (await blockedReason.innerText().catch(() => "")) || "no reason rendered";
    rejections.push(`"${grantTitle}": ${reason}`);
    expect(
      candidate < MAX_CANDIDATES - 1,
      `None of the ${MAX_CANDIDATES} candidate grants for "${SEARCH_QUERY}" were draftable, ` +
        `so the rest of the lifecycle could not run:\n  - ${rejections.join("\n  - ")}`,
    ).toBe(true);
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
  // "The mutation finished" is not "the review succeeded". onCritic() surfaces
  // a failure as a toast and leaves proposals.critic_score NULL, so the run
  // sails on and only dies later at the submit gate reporting "not reviewed" —
  // which points at the wrong thing entirely. Confirmed live 2026-08-16: the
  // critic was failing with ollama_prewarm_404 (model 'phi4-mini:latest' not
  // found) while this step reported success.
  await expect(
    page.getByText(/quality review completed/i),
    "the quality review reported an error instead of completing - check agent_runs for the critic",
  ).toBeVisible({ timeout: 15_000 });
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
  const submitDialog = page.getByRole("dialog");
  await expect(submitDialog).toBeVisible({ timeout: 15_000 });

  // Actually go through with it. This used to stop at "the gate appeared",
  // which passed while `submissions` stayed empty — the test's name promised
  // "→ submit" but the submit leg was never exercised end to end. SubmitDialog
  // keeps both buttons disabled until the human-review checkbox is ticked
  // (submitProposal rejects with submit_blocked:human_review_not_confirmed
  // otherwise), and offers "Submit Anyway" only on a blocked proposal — a
  // freshly drafted one legitimately hits that path (submit-gate.shared.ts
  // also requires zero open critical requirements).
  //
  // Submitting is a TWO-phase flow, and missing that is what made this hang:
  // "Submit Anyway" does not exist on the first pass. The plain Submit posts,
  // the server answers submit_blocked:<reasons>, and _authenticated.proposals
  // .$id.tsx then re-opens the same dialog carrying a warning — only that
  // second render offers the force button. Waiting for the dialog to close
  // after one click therefore sat there for the full timeout while the dialog
  // was sitting right in front of it saying why. Confirmed live 2026-08-16:
  // "This proposal isn't ready to submit: the proposal has not been run
  // through the quality review".
  const forceSubmit = submitDialog.getByRole("button", { name: /submit anyway/i });
  const plainSubmit = submitDialog.getByRole("button", { name: /^submit$/i });

  for (let attempt = 0; attempt < 2; attempt++) {
    // The checkbox resets with the dialog's re-render, so re-tick each pass.
    await submitDialog.getByRole("checkbox").check();
    const button = (await forceSubmit.isVisible().catch(() => false)) ? forceSubmit : plainSubmit;
    await expect(button).toBeEnabled();
    await button.click();
    // Either it went through (dialog closes) or it came back with the warning
    // and the force button; give the round-trip a moment to settle.
    if (await submitDialog.isHidden({ timeout: 60_000 }).catch(() => false)) break;
    await expect(
      forceSubmit,
      "submit was blocked but no 'Submit Anyway' escape hatch appeared",
    ).toBeVisible({ timeout: 30_000 });
  }
  await expect(submitDialog).toBeHidden({ timeout: AGENT_TIMEOUT });

  // Verify it was recorded, not just that the dialog closed. Matching on a
  // distinctive prefix rather than the whole heading: grant titles here run
  // long and carry em-dashes, and an exact full-string getByText is brittle
  // against any whitespace or punctuation the list renders differently.
  await page.goto("/submissions");
  const titleFragment = grantTitle.split(/\s+/).slice(0, 5).join(" ");
  await expect(
    page.getByText(titleFragment, { exact: false }).first(),
    `submitted grant "${titleFragment}" did not appear on /submissions`,
  ).toBeVisible({ timeout: 30_000 });
  expect(consoleErrors, `Console errors after submit: ${consoleErrors.join("; ")}`).toEqual([]);
});
