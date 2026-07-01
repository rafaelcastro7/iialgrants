import { describe, expect, it } from "vitest";
import {
  buildOfficialSearchQueries,
  extractAnchorCandidatesFromHtml,
  extractSitemapCandidatesFromXml,
} from "@/lib/site-candidates.server";

const BASE = "https://nrc.canada.ca/en/support-technology-innovation/some-program";

describe("extractAnchorCandidatesFromHtml", () => {
  it("keeps same-host official detail links and rejects noise", () => {
    const html = `
      <a href="/en/support/how-to-apply">How to apply</a>
      <a href="https://nrc.canada.ca/en/support/eligibility">Eligibility criteria</a>
      <a href="https://nrc.canada.ca/en/contact">Contact us</a>
      <a href="https://example.com/program/apply">External mirror</a>
    `;

    const urls = extractAnchorCandidatesFromHtml(html, BASE, { max: 3 }).map((candidate) => candidate.url);
    expect(urls).toContain("https://nrc.canada.ca/en/support/how-to-apply");
    expect(urls).toContain("https://nrc.canada.ca/en/support/eligibility");
    expect(urls).not.toContain("https://nrc.canada.ca/en/contact");
    expect(urls.some((url) => url.includes("example.com"))).toBe(false);
  });
});

describe("extractSitemapCandidatesFromXml", () => {
  it("ranks same-host sitemap urls by program relevance", () => {
    const xml = `
      <urlset>
        <url><loc>https://nrc.canada.ca/en/contact</loc></url>
        <url><loc>https://nrc.canada.ca/en/support/industrial-research-assistance-program/how-to-apply</loc></url>
        <url><loc>https://nrc.canada.ca/en/support/industrial-research-assistance-program/eligibility</loc></url>
      </urlset>
    `;

    const urls = extractSitemapCandidatesFromXml(xml, BASE, {
      title: "Industrial Research Assistance Program",
      max: 3,
    }).map((candidate) => candidate.url);

    expect(urls).toEqual([
      "https://nrc.canada.ca/en/support/industrial-research-assistance-program/how-to-apply",
      "https://nrc.canada.ca/en/support/industrial-research-assistance-program/eligibility",
    ]);
  });
});

describe("buildOfficialSearchQueries", () => {
  it("builds robust host-scoped queries from title and path", () => {
    const queries = buildOfficialSearchQueries(
      "https://cihr-irsc.gc.ca/e/193.html",
      "Canada Research Training Awards Suite - Research Travel Supplements",
    );

    expect(queries[0]).toContain("site:cihr-irsc.gc.ca");
    expect(queries.join(" ")).toContain("travel");
    expect(queries.join(" ")).toContain("eligibility");
  });
});
