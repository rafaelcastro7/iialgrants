#!/usr/bin/env node
// Self-evaluation daemon — continuously scores the PRODUCT's own health, not
// just process/data anomalies. Each cycle computes a deterministic quality
// scorecard from the live DB (grant coverage, grounding, completeness, fit
// distribution, submission readiness), appends it to a JSONL trend log, and
// flags any regression vs. the previous scorecard. When the GPU is idle it
// adds a one-line local-LLM narrative; when busy it silently skips the LLM and
// still records the numbers. Read-only: never mutates app data or code.
//
// Usage: node scripts/self-eval-daemon.mjs [intervalMinutes=30]

import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { logTo, withPg, ollamaChatWhenIdle, pct, stamp } from "./daemon-shared.mjs";

const INTERVAL_MIN = Number(process.argv[2]) || 30;
const LOG_FILE = "scripts/self-eval-report.log";
const METRICS_FILE = "scripts/self-eval-metrics.jsonl";

const log = (section, message) => logTo(LOG_FILE, section, message);

async function computeScorecard(db) {
  const row = async (sql) => (await db.query(sql)).rows[0];
  const scalar = async (sql) => Number((await row(sql)).n);

  const byStatus = await db.query(`select status, count(*)::int n from grants group by status`);
  const statusMap = Object.fromEntries(byStatus.rows.map((r) => [r.status, r.n]));
  const total = byStatus.rows.reduce((s, r) => s + r.n, 0);

  const TERMINAL = ["archived", "expired", "lost"];
  const active = byStatus.rows
    .filter((r) => !TERMINAL.includes(r.status))
    .reduce((s, r) => s + r.n, 0);

  const stuck = await scalar(
    `select count(*)::int n from grants where status='discovered' and enrich_attempts >= 3`,
  );

  // Grounding coverage: of grants with a stored fit evaluation, how many have
  // at least one evidence span (the anti-hallucination guarantee actually
  // landing on the record).
  const scoredWithEval = await scalar(
    `select count(distinct grant_id)::int n from grant_evaluations`,
  );
  const scoredGrounded = await scalar(
    `select count(distinct ge.grant_id)::int n
       from grant_evaluations ge
       where exists (select 1 from evidence_spans es where es.grant_id = ge.grant_id)`,
  );

  // Data completeness across the 5 user-facing facts, over non-discovered grants.
  const completeness = Number(
    (
      await row(`
      select coalesce(avg(score), 0)::float n from (
        select (
          (case when summary is not null and length(trim(summary))>0 then 1 else 0 end) +
          (case when amount_cad_min is not null or amount_cad_max is not null then 1 else 0 end) +
          (case when deadline is not null then 1 else 0 end) +
          (case when eligibility is not null and eligibility::text not in ('{}','null','[]') then 1 else 0 end) +
          (case when sectors is not null and array_length(sectors,1) > 0 then 1 else 0 end)
        )::float / 5 as score
        from grants where status <> 'discovered'
      ) t`)
    ).n,
  );

  const fit = await row(`
      select
        coalesce(percentile_cont(0.5) within group (order by fit_score),0)::float median,
        coalesce(min(fit_score),0)::float lo,
        coalesce(max(fit_score),0)::float hi,
        count(*)::int n
      from grant_evaluations`);

  const dupes = await scalar(`
      select count(*)::int n from (
        select funder_id, lower(regexp_replace(title,'[^a-zA-Z0-9]+',' ','g')) t
        from grants where status <> 'archived'
        group by funder_id, t having count(*) > 1
      ) d`);

  const fakeUsers = await scalar(
    `select count(*)::int n from auth.users where email like 'live-pilot-%@iial.test'`,
  );

  const fabricated = await scalar(`
      select count(*)::int n from grants
      where requirements::text ilike '%Must be registered as:%'
         or requirements::text ilike '%Financial documentation required%'`);

  const proposals = await scalar(`select count(*)::int n from proposals`);
  const proposalsReviewed = await scalar(
    `select count(*)::int n from proposals where critic_score is not null`,
  );

  return {
    ts: stamp(),
    total,
    active,
    by_status: statusMap,
    stuck_at_max_attempts: stuck,
    scored_with_eval: scoredWithEval,
    grounding_coverage_pct: pct(scoredGrounded, scoredWithEval),
    data_completeness_pct: Math.round(completeness * 1000) / 10,
    fit_median: Math.round(fit.median * 100) / 100,
    fit_range: [Math.round(fit.lo * 100) / 100, Math.round(fit.hi * 100) / 100],
    evaluations: fit.n,
    duplicate_clusters: dupes,
    fake_test_accounts: fakeUsers,
    fabricated_requirements: fabricated,
    proposals,
    proposals_reviewed: proposalsReviewed,
  };
}

function previousScorecard() {
  if (!existsSync(METRICS_FILE)) return null;
  try {
    const lines = readFileSync(METRICS_FILE, "utf8").trim().split("\n").filter(Boolean);
    if (lines.length === 0) return null;
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

// Compare current vs previous and return human-readable regression flags.
function detectRegressions(cur, prev) {
  const flags = [];
  // Absolute red lines (should always be zero).
  if (cur.fake_test_accounts > 0) flags.push(`${cur.fake_test_accounts} fake test account(s)`);
  if (cur.fabricated_requirements > 0)
    flags.push(`${cur.fabricated_requirements} grant(s) with fabricated requirements`);
  if (!prev) return flags;
  if (cur.grounding_coverage_pct < prev.grounding_coverage_pct - 5)
    flags.push(
      `grounding coverage dropped ${prev.grounding_coverage_pct}% -> ${cur.grounding_coverage_pct}%`,
    );
  if (cur.data_completeness_pct < prev.data_completeness_pct - 5)
    flags.push(
      `data completeness dropped ${prev.data_completeness_pct}% -> ${cur.data_completeness_pct}%`,
    );
  if (cur.duplicate_clusters > prev.duplicate_clusters)
    flags.push(`duplicate clusters rose ${prev.duplicate_clusters} -> ${cur.duplicate_clusters}`);
  if (cur.stuck_at_max_attempts > prev.stuck_at_max_attempts)
    flags.push(`stuck grants rose ${prev.stuck_at_max_attempts} -> ${cur.stuck_at_max_attempts}`);
  return flags;
}

async function cycle() {
  log("cycle", "--- computing product self-evaluation scorecard ---");
  const prev = previousScorecard();
  const cur = await withPg(computeScorecard);

  appendFileSync(METRICS_FILE, JSON.stringify(cur) + "\n");
  log(
    "scorecard",
    `grants=${cur.total} active=${cur.active} stuck=${cur.stuck_at_max_attempts} ` +
      `grounding=${cur.grounding_coverage_pct}% completeness=${cur.data_completeness_pct}% ` +
      `fit_median=${cur.fit_median} dupes=${cur.duplicate_clusters} ` +
      `proposals=${cur.proposals}/${cur.proposals_reviewed} reviewed`,
  );

  const regressions = detectRegressions(cur, prev);
  if (regressions.length > 0) {
    log("REGRESSION", regressions.join(" | "));
  } else {
    log("scorecard", "no regressions vs previous scorecard");
  }

  // Optional narrative — only when the GPU is idle. Small model, tight budget.
  const narrative = await ollamaChatWhenIdle(
    "qwen2.5:7b",
    [
      {
        role: "system",
        content:
          "You assess a grant-intelligence product's health. Given two JSON scorecards (previous, current), reply with ONE sentence: is it improving, flat, or regressing, and the single most important thing to work on next. No preamble.",
      },
      { role: "user", content: JSON.stringify({ previous: prev, current: cur }) },
    ],
    { timeoutMs: 90000 },
  );
  if (narrative.skipped) {
    log("narrative", `skipped (${narrative.reason})`);
  } else {
    log("narrative", narrative.text.replace(/\s+/g, " ").trim().slice(0, 400));
  }

  log("cycle", `--- done, sleeping ${INTERVAL_MIN}m ---`);
}

async function main() {
  log("daemon", `self-eval-daemon started, polling every ${INTERVAL_MIN} minutes`);
  while (true) {
    await cycle().catch((e) => log("cycle", `FATAL (continuing): ${e.message}`));
    await new Promise((r) => setTimeout(r, INTERVAL_MIN * 60 * 1000));
  }
}

main();
