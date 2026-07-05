import { describe, expect, it, vi } from "vitest";
import { bumpProposalVersion } from "@/lib/proposal-versioning";

describe("bumpProposalVersion", () => {
  it("delegates to the atomic PostgreSQL function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 4, error: null });
    const next = await bumpProposalVersion(
      { rpc } as never,
      "11111111-1111-1111-1111-111111111111",
    );

    expect(next).toBe(4);
    expect(rpc).toHaveBeenCalledWith("bump_proposal_version", {
      target_proposal_id: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("turns database failures into a typed versioning error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "forbidden" } });

    await expect(
      bumpProposalVersion({ rpc } as never, "11111111-1111-1111-1111-111111111111"),
    ).rejects.toThrow("proposal_version_bump_failed:forbidden");
  });

  it("rejects an empty RPC result even when PostgREST reports no error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    await expect(
      bumpProposalVersion({ rpc } as never, "11111111-1111-1111-1111-111111111111"),
    ).rejects.toThrow("proposal_version_bump_failed:empty_result");
  });
});
