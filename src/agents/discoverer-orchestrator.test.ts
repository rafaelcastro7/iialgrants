import { describe, expect, it, vi } from "vitest";
import { runWithConcurrency, shouldRetryDiscoveryError } from "./discoverer-orchestrator.server";

describe("runWithConcurrency", () => {
  it("starts the next item as soon as a worker becomes available", async () => {
    const releases = new Map<number, () => void>();
    const started: number[] = [];
    let active = 0;
    let peak = 0;

    const run = runWithConcurrency([0, 1, 2], 2, async (item) => {
      started.push(item);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.set(item, resolve));
      active -= 1;
    });

    await vi.waitFor(() => expect(started).toEqual([0, 1]));
    releases.get(0)?.();
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
    expect(active).toBe(2);
    expect(peak).toBe(2);

    releases.get(1)?.();
    releases.get(2)?.();
    await run;
    expect(active).toBe(0);
  });

  it("processes every item when concurrency is invalid or oversized", async () => {
    const processed: number[] = [];
    await runWithConcurrency([1, 2, 3], 0, async (item) => {
      processed.push(item);
    });
    expect(processed).toEqual([1, 2, 3]);
  });
});

describe("shouldRetryDiscoveryError", () => {
  it("does not overlap a timed-out crawl that cannot be cancelled", () => {
    expect(shouldRetryDiscoveryError("funder_run_timeout_90000ms", 1)).toBe(false);
  });

  it("retries an ordinary transient failure only before the final attempt", () => {
    expect(shouldRetryDiscoveryError("fetch failed", 1)).toBe(true);
    expect(shouldRetryDiscoveryError("fetch failed", 2)).toBe(false);
  });
});
