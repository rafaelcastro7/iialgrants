# Local self-improvement daemons

Three always-local, zero-cloud-token background daemons keep the IIAL Grants
system honest and improving between `/loop` iterations. They use only local
infrastructure: direct Supabase Postgres (`:15432`), local Ollama (`:11434`),
and the Ollama proxy (`:11435`) `loadTier` signal so heavy LLM work backs off
instead of fighting a foreground pipeline run for the GPU.

All three are read-only with respect to app code and data. They detect,
measure, and propose; they never mutate the app or apply changes. That boundary
is deliberate: an unsupervised process auto-applying LLM edits is a hazard, not
a helper.

## The daemons

| Script                   | Cadence | What it does                                                                                                                                                                                                                                                               | Output                                            |
| ------------------------ | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `live-audit-daemon.mjs`  |  15 min | Process health (dev/Ollama/proxy/Supabase containers), local Ollama code audit of files changed since the last completed checkpoint, and DB anomaly checks (duplicate clusters, stuck enrichments, fake test accounts, implausible amounts, fabricated requirements).      | `live-audit-report.log`                           |
| `self-eval-daemon.mjs`   |  30 min | Deterministic product-quality scorecard from the live DB: grant coverage, grounding %, data completeness %, fit distribution, submission readiness, JSONL trend, and regression flags vs the previous scorecard. Adds a one-line local-LLM narrative when the GPU is idle. | `self-eval-report.log`, `self-eval-metrics.jsonl` |
| `improvement-daemon.mjs` |  45 min | Reads the other two daemons' signal, latest deterministic scorecard, and recent commits. When the GPU is idle it asks a local model to synthesize an evidenced, prioritized improvement backlog. Proposals only.                                                           | `improvement-report.log`, `improvement-queue.md`  |

Shared helpers for loadTier-aware Ollama calls, Postgres, and logging live in
`daemon-shared.mjs`.

## Self-check contract

The Autonomy tab does not merely display logs. It imports unit-tested logic via
`src/lib/autonomy-intel.server.ts`:

- `src/lib/autonomy-logic.ts` parses daemon lines, evaluates liveness windows,
  classifies daemon health (`healthy`, `stale`, `silent`), computes the system
  verdict, and detects scorecard regressions.
- A daemon with a recent timestamp but no useful signal is `silent`, not green.
- Regressions are computed from `scripts/self-eval-metrics.jsonl` previous vs
  current rows, not scraped from loose log prose.
- `src/lib/autonomy-logic.test.ts` covers the self-check behavior; keep those
  tests green whenever daemon semantics change.

## Running them

```bash
node scripts/live-audit-daemon.mjs      # default 15-minute cycle
node scripts/self-eval-daemon.mjs       # default 30-minute cycle
node scripts/improvement-daemon.mjs     # default 45-minute cycle
# each takes an optional [intervalMinutes] arg
```

Runtime state/output files (`*.log`, `.local-audit-report.json`,
`self-eval-metrics.jsonl`, `improvement-queue.md`, `.live-audit-state.json`)
are gitignored and regenerated every cycle.

## Code-audit checkpoint rules

`live-audit-daemon.mjs` must never advance `lastCommit` until every auditable
`.ts`/`.tsx` file in that commit has been processed. Because local model audits
are slow, it processes at most three files per cycle and stores:

- `pendingAuditCommit`
- `auditedFilesForCommit`

If the GPU is busy or the proxy circuit is open, the daemon defers code audit
and leaves the checkpoint untouched so the next idle cycle retries the same
commit.

Local 7B audit findings are heuristic and unverified. Treat them as triage
input only; re-read the current source before acting.
`scripts/local-audit.mjs` writes its scratch report to
`scripts/.local-audit-report.json` by default, so daemon cycles do not dirty the
tracked historical `scripts/local-audit-report.json` snapshot. Override with
`LOCAL_AUDIT_REPORT=path` only when you intentionally need a custom artifact.

## Improvement proposal rules

`improvement-daemon.mjs` must ground every proposal in either:

- a concrete number from the latest scorecard, or
- a specific audit/self-eval log line.

It must avoid recent commits, reject generic advice, and is allowed to produce:

```text
[none] system is healthy; no evidenced improvements.
```

That `[none]` path is a feature. It prevents the backlog from filling with
busywork when the measured system is healthy.

## How the loop uses them

Each `/loop` iteration should skim:

- `scripts/live-audit-report.log` for new anomalies.
- `scripts/self-eval-report.log` for regressions.
- `scripts/self-eval-metrics.jsonl` for the latest numeric scorecard.
- `scripts/improvement-queue.md` for the current evidenced backlog.

The daemons continuously turn "what is the state of the product" into a
concrete, triaged worklist; the loop consumes it.

## Local-runtime notes

- Heavy LLM calls self-suppress (`skipped: load_tier_high` / `circuit_open`)
  when the proxy reports a busy GPU, and retry next cycle.
- `qwen2.5:7b` is used for synthesis/narrative; the `qwen2.5-coder:7b`
  variant can be too slow on this GPU and is used only by code audit.
- LLM output is capped with `num_predict`; without it a small model can run
  until timeout on structured-output prompts.
