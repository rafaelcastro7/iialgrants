// Proves the actual capability gap this engine closes: a static fetch never
// executes JavaScript, so content inserted into the DOM after page-load is
// invisible to it. renderWithBrowser must capture that same content because it
// runs a real browser. Uses a self-contained data: URL fixture — no network,
// no flakiness, deterministic pass/fail on the one thing that matters.
import { afterAll, describe, expect, it } from "vitest";
import { renderWithBrowser, closeBrowserRenderer } from "@/lib/browser-render.server";
import { htmlToReadableMarkdown } from "@/lib/scrape-engine.server";

// No underscores: turndown (markdown) backslash-escapes "_" as emphasis
// syntax, which would make a naive substring check fail even though the
// content rendered correctly — keep the marker plain alphanumeric.
const JS_INSERTED_MARKER = "JSRENDEREDELIGIBILITYMARKER7f3a";

const STATIC_HTML = `<!doctype html>
<html>
<head><title>Test Grant Page</title></head>
<body>
  <main id="root">
    <p>This program supports Canadian small businesses.</p>
  </main>
  <script>
    setTimeout(function () {
      document.getElementById('root').innerHTML +=
        '<h2>Eligibility</h2><p>${JS_INSERTED_MARKER}: funding up to $250,000 CAD, deadline 2027-03-31.</p>';
    }, 150);
  </script>
</body>
</html>`;

const dataUrl = `data:text/html,${encodeURIComponent(STATIC_HTML)}`;

describe("browser-render captures client-rendered content static engines cannot", () => {
  // Chromium shutdown can be slow on this CI/dev box, so give the cleanup
  // hook enough room to finish instead of failing a healthy suite on exit.
  afterAll(async () => {
    await closeBrowserRenderer();
  }, 30_000);

  it("a static HTML parse of the same markup does NOT see the JS-inserted marker", () => {
    const { markdown } = htmlToReadableMarkdown(STATIC_HTML, "https://example.test/grant");
    // The literal <script> source contains the marker as a string, so this
    // asserts against the *rendered* content path, not a substring accident:
    // Readability strips <script> tags, so the marker must be absent from the
    // extracted markdown when no JS execution happens.
    expect(markdown).not.toContain(JS_INSERTED_MARKER);
  });

  it("renderWithBrowser executes the script and captures the post-JS content", async () => {
    const result = await renderWithBrowser(dataUrl, { minContentChars: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toContain(JS_INSERTED_MARKER);
    expect(result.markdown).toContain("250,000");
    // The pre-JS content must still be present too — this is additive
    // capability, not a replacement of the static extraction.
    expect(result.markdown).toContain("small businesses");
  }, 30_000);

  it("degrades gracefully (ok:false, no throw) on a URL Chromium cannot resolve", async () => {
    const result = await renderWithBrowser("http://this-host-does-not-exist.invalid/page", {
      timeoutMs: 5_000,
    });
    expect(result.ok).toBe(false);
  }, 15_000);
});
