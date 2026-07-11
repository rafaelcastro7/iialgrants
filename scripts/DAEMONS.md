# Local self-improvement daemons

Three always-local, zero-cloud-token background daemons that keep the IIAL
Grants system honest and improving between `/loop` iterations. They use only
local infrastructure — direct Supabase Postgres (`:15432`) and local Ollama
(`:11434`) — and coordinate through the Ollama proxy's (`:11435`) `loadTier`
signal so heavy LLM work backs off instead of fighting a foreground pipeline
run for the GPU.

All three are **read-only with respect to app code and data**. They detect,
measure, and propose; they never mutate the app or apply changes. That
boundary is deliberate: an unsupervised process auto-applying LLM edits is a
hazard, not a helper.

## The daemons

| Script | Cadence | What it does | Output |
|---|---|---|---|
| `live-audit-daemon.mjs` | 15 min | Process health (dev/Ollama/proxy/Supabase containers) + local Ollama code audit of files changed since last commit + DB anomaly checks (duplicate clusters, stuck enrichments, fake test accounts, implausible amounts, **fabricated requirements**) | `live-audit-report.log` |
| `self-eval-daemon.mjs` | 30 min | Deterministic product-quality **scorecard** from the live DB (grant coverage, grounding %, data completeness %, fit distribution, submission readiness), a JSONL trend log, and **regression flags** vs. the previous scorecard. Adds a one-line local-LLM narrative when the GPU is idle. | `self-eval-report.log`, `self-eval-metrics.jsonl` |
| `improvement-daemon.mjs` | 45 min | Reads the other two daemons' signal + recent commits and, only when the GPU is idle, asks a local model to synthesize a **prioritized improvement backlog**. Proposals only. | `improvement-report.log`, `improvement-queue.md` |

Shared helpers (loadTier-aware Ollama calls, Postgres, logging) live in
`daemon-shared.mjs`.

## Running them

```bash
node scripts/live-audit-daemon.mjs      # default 15-min cycle
node scripts/self-eval-daemon.mjs       # default 30-min cycle
node scripts/improvement-daemon.mjs     # default 45-min cycle
# each takes an optional [intervalMinutes] arg
```

Runtime state/output files (`*.log`, `self-eval-metrics.jsonl`,
`improvement-queue.md`, `.live-audit-state.json`) are gitignored — they are
regenerated every cycle.

## How the loop uses them

Each `/loop` iteration should skim `live-audit-report.log` (new anomalies),
`self-eval-report.log` (regressions), and `improvement-queue.md` (the current
prioritized backlog) before deciding what to work on. The daemons continuously
turn "what's the state of the product" into a concrete, triaged worklist; the
loop consumes it.

## Local-runtime notes

- Heavy LLM calls self-suppress (`skipped: load_tier_high` / `circuit_open`)
  when the proxy reports a busy GPU, and retry next cycle — so running a
  foreground batch pipeline never starves or is starved by the daemons.
- `qwen2.5:7b` is used for synthesis/narrative; the `qwen2.5-coder:7b` variant
  was not returning within budget on this GPU (a local Ollama-runtime flake),
  and triage synthesis doesn't need code generation.
- LLM output is capped with `num_predict` — without it a small model can run
  away generating tokens on a structured-output prompt until the timeout.
