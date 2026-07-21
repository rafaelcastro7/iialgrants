import { describe, expect, it } from "vitest";
import { summarizeDiscoveryJobRows } from "@/lib/grants.functions";

const jobId = "11111111-1111-4111-8111-111111111111";

function row(
  status: string,
  created_at: string,
  metadata: Record<string, unknown>,
  error: string | null = null,
) {
  return {
    run_id: crypto.randomUUID(),
    status,
    error,
    latency_ms: null,
    metadata: { job_id: jobId, ...metadata },
    created_at,
  };
}

describe("summarizeDiscoveryJobRows", () => {
  it("trusts the latest completed aggregate when no late funder rows exist", () => {
    const summary = summarizeDiscoveryJobRows(jobId, [
      row("running", "2026-07-21T17:00:00.000Z", { stage: "orchestrator_started" }),
      row("succeeded", "2026-07-21T17:01:00.000Z", {
        funder_id: "f1",
        funder_name: "Mitacs",
        inserted: 2,
        seen_again: 3,
      }),
      row("succeeded", "2026-07-21T17:02:00.000Z", {
        stage: "orchestrator_completed",
        funders_queued: 1,
        totalInserted: 2,
        totalSeenAgain: 3,
        totalProcessed: 1,
        totalDegraded: 0,
        totalFailed: 0,
        evaluated: 0,
      }),
    ]);

    expect(summary.status).toBe("completed");
    expect(summary.totalInserted).toBe(2);
    expect(summary.totalSeenAgain).toBe(3);
    expect(summary.totalProcessed).toBe(1);
    expect(summary.totalDegraded).toBe(0);
    expect(summary.totalFailed).toBe(0);
  });

  it("recomputes totals when funder rows arrive after an early completed marker", () => {
    const summary = summarizeDiscoveryJobRows(jobId, [
      row("running", "2026-07-21T17:00:00.000Z", { stage: "orchestrator_started" }),
      row("succeeded", "2026-07-21T17:01:00.000Z", {
        stage: "orchestrator_completed",
        funders_queued: 3,
        totalInserted: 0,
        totalSeenAgain: 0,
        totalProcessed: 1,
        totalDegraded: 1,
        totalFailed: 1,
        evaluated: 0,
      }),
      row("succeeded", "2026-07-21T17:02:00.000Z", {
        funder_id: "f1",
        funder_name: "Mitacs",
        inserted: 5,
        seen_again: 14,
      }),
      row(
        "degraded",
        "2026-07-21T17:03:00.000Z",
        {
          funder_id: "f2",
          funder_name: "Innovation Canada",
          attempt: 1,
        },
        "page_too_short",
      ),
      row(
        "failed",
        "2026-07-21T17:04:00.000Z",
        {
          funder_id: "f3",
          funder_name: "Trade Commissioner Service",
          attempt: 2,
        },
        "fetch_failed_404",
      ),
    ]);

    expect(summary.status).toBe("completed");
    expect(summary.totalInserted).toBe(5);
    expect(summary.totalSeenAgain).toBe(14);
    expect(summary.totalProcessed).toBe(3);
    expect(summary.totalDegraded).toBe(1);
    expect(summary.totalFailed).toBe(1);
    expect(summary.perFunder.map((f) => f.status).sort()).toEqual([
      "degraded",
      "failed",
      "succeeded",
    ]);
  });
});
