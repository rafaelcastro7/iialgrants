// Unit test: scrape engine produces clean markdown from real-ish HTML
// without any external API. Verifies Readability + linkedom + turndown chain.
import { describe, it, expect } from "vitest";
import { scrapeEngineFetch } from "@/lib/scrape-engine.server";

const SAMPLE_HTML = `<!doctype html><html><head>
  <title>Industrial Research Assistance Program (IRAP)</title>
  <meta name="description" content="Funding for Canadian SMEs.">
</head><body>
  <nav><ul><li>Home</li><li>Contact</li></ul></nav>
  <article>
    <h1>Industrial Research Assistance Program (IRAP)</h1>
    <p>IRAP provides advisory services and funding to qualified small and
    medium-sized enterprises in Canada to help them develop and commercialize
    innovative, technology-driven new or improved products, services or processes.</p>
    <ul>
      <li>Up to <strong>CAD 1,000,000</strong> non-repayable contribution.</li>
      <li>Eligibility: incorporated for-profit SMEs with 1-499 employees.</li>
    </ul>
    <p>Apply through the NRC Innovation Assistance portal.</p>
  </article>
  <footer>© NRC</footer>
  <script>tracker()</script>
</body></html>`;

describe("scrape-engine", () => {
  it("extracts main content via Readability and converts to markdown", async () => {
    // Mock fetch to return our sample.
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      return new Response(SAMPLE_HTML, {
        status: 200,
        headers: {
          "content-type": "text/html",
          etag: 'W/"abc123"',
          "last-modified": "Wed, 01 Jan 2025 00:00:00 GMT",
        },
      });
    }) as typeof fetch;
    try {
      const r = await scrapeEngineFetch("https://example.org/irap");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.title).toMatch(/IRAP|Industrial Research/);
      expect(r.markdown).toMatch(/IRAP/);
      expect(r.markdown).toMatch(/CAD 1,000,000/);
      // Footer + script + nav should be gone.
      expect(r.markdown).not.toMatch(/tracker\(\)/);
      expect(r.markdown).not.toMatch(/© NRC/);
      expect(r.etag).toBe('W/"abc123"');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("honours robots.txt Disallow", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow: /private/", { status: 200 });
      }
      return new Response(SAMPLE_HTML, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    try {
      const r = await scrapeEngineFetch("https://example2.org/private/secret");
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBe("robots_disallow");
        expect(r.blocked).toBe(true);
      }
    } finally {
      globalThis.fetch = orig;
    }
  });
});
