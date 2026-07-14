# Session Summary: Autonomy & Data-Quality Loop - 2026-07-13

**Status**: implemented locally; corrected on 2026-07-14 after review.
**Scope**: daemon fleet, self-criticism, data-quality analysis, stuck-grant
investigation, and 24/7 operations.

## What Claude Added

- Memory-aware `improvement-daemon.mjs` updates.
- `self-criticism-daemon.mjs` and UI surface for self-criticism findings.
- `daemon-watchdog.mjs` for dead/hung daemon repair.
- Data-quality analysis scripts and improvement roadmap.
- Initial stuck-grant investigation for `Capital of Development`.
- Initial 24/7 supervisor, Windows autostart, desktop shortcut, and operations
  docs.

Relevant local commits before Codex review:

- `13fbd71` watchdog daemon + improvement daemon streaming/GPU-lock fixes
- `51f5b3b` memory integration in improvement daemon
- `857cf47` self-criticism daemon
- `21b9c19` autonomy UI self-criticism findings
- `7996ae2` initial stuck-grant rescue scripts
- `ca7f800` data quality audit + extraction validator
- `a9adbf5` data-completeness improvement roadmap
- `2c6c43c` session summary
- `cc60984` initial 24/7 operations scripts

## Codex Review Corrections - 2026-07-14

Claude's direction was useful, but several operational details needed hardening
before push:

- The desktop launcher pointed to stale `5173/app` URLs. It now uses this
  repo's real local route, `http://localhost:8080/grants`, and starts
  `bun run dev` in the background when needed.
- The Windows scheduled task had a 24-hour execution limit. It is now unlimited
  (`ExecutionTimeLimit 0`) for actual 24/7 operation.
- The supervisor spawned daemons unconditionally and did not pass documented
  intervals. It now reuses live PID files, passes intervals, and applies a real
  sliding restart cap.
- The rescue script previously marked partial grants as `scored` without a
  `grant_evaluations` row or `scored_at`. It is now dry-run by default and, when
  `--apply` is used, moves future partial grants to `enriched` with a
  machine-readable `partial_enrichment_review` note. The evaluator remains the
  only path that marks a grant as truly `scored`.
- Added `repair-partial-scored-grants.mjs` for the historical local rows
  created by the first rescue attempt. It normalizes legacy `extracted_partial`
  notes and backfills missing `scored_at` from the latest evaluation timestamp.
- Hardened `evaluateGrantImpl` so a re-evaluation of an already-`scored` grant
  backfills `scored_at` when it is missing.
- Rewrote `data-quality-analyzer.mjs` in clean ASCII and added explicit
  integrity counters for missing evaluations, missing `scored_at`, and legacy
  partial notes.
- Operations docs were rewritten with the correct ports, logs, safety limits,
  and validation checklist.

## Data-Quality Reality

The strongest finding remains valid: amount and deadline extraction are the
main completeness gaps.

- Latest corrected analyzer snapshot, after local data repair:
  `scored_missing_eval=0`, `scored_missing_scored_at=0`,
  `legacy_partial_notes=0`, `partial_review_notes=10`.
- Active/scored completeness is 66% in the analyzed set: summary 100%, amount
  min 10%, deadline 20%, eligibility 100%, sectors 100%.
- Summary/eligibility/sector coverage is strong in the analyzed set.
- Amount extraction coverage was reported as very low.
- Deadline extraction coverage was reported as very low.
- Some funders genuinely do not publish amount/deadline, so the system should
  support honest partial enrichment instead of fake certainty.

## Current Interpretation of the Rescue

The DB action Claude ran did reduce the local "discovered and exhausted" queue,
including `Capital of Development`, but it should be treated as an operational
rescue, not proof that those grants were evaluated. Future correction should
prefer:

1. `discovered -> enriched` for useful partial data.
2. Add `partial_enrichment_review` requirement metadata.
3. Run evaluator/fit rules to create `grant_evaluations`, `fit_score`, and
   `scored_at`.
4. Only then call a grant truly `scored`.

## Next Priorities

1. Improve deterministic amount extraction in
   `src/agents/extractors/amounts.server.ts`.
2. Improve deterministic deadline extraction in
   `src/agents/extractors/deadlines.server.ts`.
3. Add focused tests in `src/agents/extractors/amounts.test.ts` and
   `src/agents/extractors/extractors.test.ts`.
4. Re-run self-eval and verify completeness changes with real metrics.
5. Browser-check `/autonomy` and the launcher flow after the 24/7 corrections.
