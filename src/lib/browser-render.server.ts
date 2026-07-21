// Headless-browser rendering fallback — the capability the static engines
// (scrape-engine, raw fetch, wayback, archive.today) fundamentally cannot
// have: real JavaScript execution and on-page navigation. Some funder pages
// render their eligibility/amount/deadline content client-side, or hide it
// behind a tab/accordion that only appears after a click. Jina Reader (the
// remote fallback) also renders JS, but it's a third-party service subject to
// its own rate limits/blocking; this engine is local, free, and can attempt
// the same "click the Eligibility tab" navigation a human would do.
//
// Determinism is unchanged by this engine: it only WIDENS what text becomes
// available to extract from — every fact still has to pass the existing
// grounding gate (snippetIsGrounded in evidence.server.ts / the field-quote
// check in enricher-steps.server.ts) before it's accepted. This engine never
// invents content; it renders real, currently-hidden DOM into markdown.
import type { Browser } from "playwright";
import { htmlToReadableMarkdown } from "@/lib/scrape-engine.server";
import { loadRobots, throttle } from "@/lib/scrape-engine.server";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Labels of on-page elements worth clicking before extraction — tabs,
// accordions, or "show more" toggles that gate exactly the fields this
// pipeline needs (eligibility, funding amount, deadline, application steps).
// Best-effort only: a page with none of these is rendered as-is.
const REVEAL_LABEL_PATTERN =
  /eligib|crit[eè]res?|admissib|how to apply|comment (postuler|soumettre)|application process|apply now|funding amount|montant|deadline|date limite|requirements|exigences|show more|voir plus|read more|en savoir plus/i;
const MAX_REVEAL_CLICKS = 6;

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.isConnected()) return existing;
    } catch {
      /* fall through to relaunch */
    }
    browserPromise = null;
  }
  browserPromise = (async () => {
    const { chromium } = await import("playwright");
    return chromium.launch({ headless: true });
  })();
  return browserPromise;
}

export type BrowserRenderResult =
  | { ok: true; via: "browser_render"; url: string; title?: string; markdown: string }
  | { ok: false; via: "browser_render"; url: string; error: string };

export async function renderWithBrowser(
  url: string,
  opts: { timeoutMs?: number; minContentChars?: number } = {},
): Promise<BrowserRenderResult> {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const minChars = opts.minContentChars ?? 200;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, via: "browser_render", url, error: "invalid_url" };
  }

  try {
    const allow = await loadRobots(parsed.origin);
    if (!allow(url)) return { ok: false, via: "browser_render", url, error: "robots_disallow" };
  } catch {
    /* tolerate parser errors, same policy as scrape-engine.server.ts */
  }
  await throttle(parsed.host);

  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (e) {
    // Missing Chromium binary or launch failure — degrade gracefully so the
    // caller's fallback chain continues (Jina/raw/wayback/archive), instead
    // of crashing enrichment for every grant.
    return {
      ok: false,
      via: "browser_render",
      url,
      error: `launch_failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const context = await browser.newContext({ userAgent: UA, locale: "en-CA" });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    // Let client-rendered content (fetch/XHR-populated DOM) settle. A bounded
    // wait, not `networkidle` — pages with persistent connections (chat
    // widgets, analytics beacons) can keep networkidle from ever firing.
    await page.waitForTimeout(1_500);

    await revealHiddenContent(page);

    const html = await page.content();
    const { title, markdown } = htmlToReadableMarkdown(html, page.url());
    if (markdown.length < minChars) {
      return {
        ok: false,
        via: "browser_render",
        url,
        error: `browser_render_too_short:${markdown.length}`,
      };
    }
    return { ok: true, via: "browser_render", url, title, markdown };
  } catch (e) {
    return {
      ok: false,
      via: "browser_render",
      url,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

// Best-effort: click a handful of tab/accordion/show-more style elements
// whose visible text matches REVEAL_LABEL_PATTERN, so content that only
// renders after interaction (common for "Eligibility" / "How to apply" tabs)
// ends up in the DOM before we snapshot it. Never throws — a page with no
// matching elements, or one where clicking does nothing, is extracted as-is.
async function revealHiddenContent(page: import("playwright").Page): Promise<void> {
  try {
    const candidates = page.locator(
      'button, a[role="tab"], [role="tab"], summary, [aria-expanded="false"]',
    );
    const count = await candidates.count();
    let clicked = 0;
    for (let i = 0; i < count && clicked < MAX_REVEAL_CLICKS; i++) {
      const el = candidates.nth(i);
      let text = "";
      try {
        text = (await el.innerText({ timeout: 500 })).trim();
      } catch {
        continue;
      }
      if (!text || !REVEAL_LABEL_PATTERN.test(text)) continue;
      try {
        if (await el.isVisible()) {
          await el.click({ timeout: 1_000, trial: false });
          clicked++;
          await page.waitForTimeout(300);
        }
      } catch {
        /* element became stale/unclickable — skip it, not fatal */
      }
    }
  } catch {
    /* reveal step is best-effort; extraction proceeds on the as-loaded DOM */
  }
}

// Called once at process shutdown paths (tests) to avoid leaking a Chromium
// process across test files. Safe to call even if never launched.
export async function closeBrowserRenderer(): Promise<void> {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await Promise.race([b.close(), new Promise<void>((resolve) => setTimeout(resolve, 5_000))]);
  } catch {
    /* already closed/crashed */
  } finally {
    browserPromise = null;
  }
}
