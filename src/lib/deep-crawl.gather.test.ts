import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scrapeWithFallback: vi.fn(),
  searchWeb: vi.fn(),
  fetchCandidateLinksFromPage: vi.fn(),
  fetchCandidateLinksFromSitemaps: vi.fn(),
  buildOfficialSearchQueries: vi.fn(),
}));

vi.mock("@/lib/web-fetch.server", () => ({
  scrapeWithFallback: mocks.scrapeWithFallback,
  searchWeb: mocks.searchWeb,
}));

vi.mock("@/lib/site-candidates.server", () => ({
  fetchCandidateLinksFromPage: mocks.fetchCandidateLinksFromPage,
  fetchCandidateLinksFromSitemaps: mocks.fetchCandidateLinksFromSitemaps,
  buildOfficialSearchQueries: mocks.buildOfficialSearchQueries,
}));

const BASE = "https://example.gov/program";
const INLINE_DETAIL = "https://example.gov/program/eligibility";

describe("gatherDeepMarkdown", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.fetchCandidateLinksFromPage.mockResolvedValue([]);
    mocks.fetchCandidateLinksFromSitemaps.mockResolvedValue([]);
    mocks.buildOfficialSearchQueries.mockReturnValue(["site:example.gov program eligibility"]);
  });

  it("keeps official pages already found when third-party site search fails", async () => {
    const { gatherDeepMarkdown } = await import("@/lib/deep-crawl.server");
    const markdown = [
      "Eligible applicants include non-profits, charities, and public-sector partners.",
      "Funding guidelines explain application deadlines, eligible costs, contribution limits,",
      "and the documents required to apply to this program through the official portal.",
    ].join(" ");
    const searchErrors: Array<{ query: string; error: string }> = [];

    mocks.scrapeWithFallback.mockResolvedValue({
      ok: true,
      url: INLINE_DETAIL,
      markdown,
      via: "scrape_engine",
      attempts: [],
    });
    mocks.searchWeb.mockRejectedValue(new Error("jina_search_429"));

    const pages = await gatherDeepMarkdown(BASE, `[Eligibility details](${INLINE_DETAIL})`, {
      max: 2,
      title: "Example Program",
      onSearchError: (query, error) => {
        searchErrors.push({ query, error });
      },
    });

    expect(pages).toEqual([{ url: INLINE_DETAIL, markdown }]);
    expect(searchErrors).toEqual([
      { query: "site:example.gov program eligibility", error: "jina_search_429" },
    ]);
  });

  it("returns an honest empty result when only external search fails", async () => {
    const { gatherDeepMarkdown } = await import("@/lib/deep-crawl.server");
    const searchErrors: string[] = [];
    mocks.searchWeb.mockRejectedValue(new Error("jina_search_401"));

    const pages = await gatherDeepMarkdown(BASE, "No useful inline links", {
      max: 2,
      title: "Example Program",
      onSearchError: (_query, error) => {
        searchErrors.push(error);
      },
    });

    expect(pages).toEqual([]);
    expect(searchErrors).toEqual(["jina_search_401"]);
    expect(mocks.scrapeWithFallback).not.toHaveBeenCalled();
  });
});
