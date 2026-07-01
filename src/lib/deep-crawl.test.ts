import { describe, expect, it } from "vitest";
import { pickDeepLinks, pickSearchHits } from "@/lib/deep-crawl.server";

const BASE = "https://nrc.canada.ca/en/support-technology-innovation/some-program";

describe("pickDeepLinks", () => {
  it("picks same-host high-value links ranked by keyword hits", () => {
    const md = `
      See the [Eligibility criteria](https://nrc.canada.ca/en/support/eligibility) page.
      Read [How to apply](https://nrc.canada.ca/en/support/how-to-apply-funding).
      Check [Deadlines and dates](https://nrc.canada.ca/en/support/deadlines).
      Unrelated [Contact us](https://nrc.canada.ca/en/contact).
      External [Partner site](https://example.com/funding/apply).
    `;
    const links = pickDeepLinks(md, BASE, 3);
    expect(links).toContain("https://nrc.canada.ca/en/support/eligibility");
    expect(links).toContain("https://nrc.canada.ca/en/support/how-to-apply-funding");
    expect(links).toContain("https://nrc.canada.ca/en/support/deadlines");
    // Same-host only: the external partner site is excluded.
    expect(links.some((l) => l.includes("example.com"))).toBe(false);
    // No-keyword link excluded.
    expect(links).not.toContain("https://nrc.canada.ca/en/contact");
  });

  it("excludes the base URL and caps the result count", () => {
    const md = `
      [self](${BASE})
      [eligibility a](https://nrc.canada.ca/a-eligibility)
      [funding b](https://nrc.canada.ca/b-funding)
      [apply c](https://nrc.canada.ca/c-apply)
      [deadline d](https://nrc.canada.ca/d-deadline)
    `;
    const links = pickDeepLinks(md, BASE, 2);
    expect(links).toHaveLength(2);
    expect(links).not.toContain(BASE);
  });

  it("returns empty for markdown without qualifying links", () => {
    expect(pickDeepLinks("plain text, no links", BASE)).toEqual([]);
    expect(pickDeepLinks("[home](https://nrc.canada.ca/en)", BASE)).toEqual([]);
  });

  it("filters search hits to same-host official detail pages", () => {
    const hits = [
      {
        url: "https://nrc.canada.ca/en/support/program/how-to-apply",
        title: "How to apply for the program",
        snippet: "Application guide, deadlines and contribution details.",
      },
      {
        url: "https://example.com/mirror/program",
        title: "Mirror page",
        snippet: "Funding guide and deadline",
      },
      {
        url: "https://nrc.canada.ca/en/contact",
        title: "Contact us",
        snippet: "General contact information.",
      },
    ];

    expect(pickSearchHits(hits, BASE, [], 3)).toEqual([
      "https://nrc.canada.ca/en/support/program/how-to-apply",
    ]);
  });
});
