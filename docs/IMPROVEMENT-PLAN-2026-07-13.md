# Improvement Plan - Data Completeness 64% to 85%

**Date**: 2026-07-13  
**Reviewed/corrected**: 2026-07-14
**Status**: in progress

## Current State

Claude's data-quality pass found that completeness is lower than the optimistic
dashboard number suggested. The main missing facts are:

- latest corrected analyzer snapshot after Codex repair: 66% overall
  completeness in the active/scored sample
- amount coverage: very low in the analyzed scored/active set
- deadline coverage: very low in the analyzed scored/active set
- summary, eligibility, and sectors: comparatively strong
- pipeline integrity is clean after repair:
  `scored_missing_eval=0`, `scored_missing_scored_at=0`,
  `legacy_partial_notes=0`

Treat the exact percentages as local snapshot metrics; re-measure with
`self-eval-daemon.mjs` after each extraction change.

## Corrected Pipeline Rule

Partial enrichment is allowed, but it must stay honest:

- A grant with useful partial data can move from `discovered` to `enriched`.
- Add a `partial_enrichment_review` requirement note with missing fields.
- Do not mark it `scored` from a rescue script.
- Only `evaluateGrantImpl` should produce true scoring because it writes
  `grant_evaluations`, `fit_score`, and `scored_at`.

`scripts/rescue-stuck-grants.mjs` is now dry-run by default and requires
`--apply`.

## Target Improvements

### 1. Amount Extraction

**Files**:

- `src/agents/extractors/amounts.server.ts`
- `src/agents/extractors/amounts.test.ts`

Patterns to keep strong:

- `$500,000 CAD`
- `$500K`, `$5M`, `$5.5M`
- `from $X to $Y`
- `up to $500,000`
- `minimum $50K, maximum $500K`
- French forms such as `1 M$`, `50 000 $`, `jusqu'a 250 000 $`

Validation:

- numeric, positive amounts
- min <= max
- reject unrelated annual-budget/news figures when not anchored to funding
  language
- prefer anchored grant/funding snippets over largest-number fallback

### 2. Deadline Extraction

**Files**:

- `src/agents/extractors/deadlines.server.ts`
- `src/agents/extractors/extractors.test.ts`

Patterns to keep strong:

- `Application deadline: January 15, 2027`
- `by 2027-01-15`
- French `date limite` and month names
- `rolling intake` / `continuous intake`
- recent-past deadlines for just-closed programs

Validation:

- normalize fixed dates to `YYYY-MM-DD`
- allow rolling/continuous intake when explicit
- reject generic date mentions with no deadline/application hint

## Implementation Order

1. Re-run the data-quality analyzer and self-eval scorecard.
2. Add/adjust extractor tests for the top real failures.
3. Patch amount/deadline extractors only where tests prove a gap.
4. Run focused tests plus typecheck.
5. Run one real positive enrichment and one honest blocked/acquisition failure.
6. Update `grant-scraping-improvement/references/heuristics.md` if a new
   durable scraping lesson survives validation.

## Success Criteria

- Amount extractor gains coverage without picking unrelated numbers.
- Deadline extractor gains coverage without accepting generic page dates.
- Partial grants are visible as enriched-with-review, not fake-scored.
- `self-eval-daemon.mjs` records a measurable completeness improvement.
- No regression in `src/agents/pipeline.e2e.test.ts` or extractor tests.
