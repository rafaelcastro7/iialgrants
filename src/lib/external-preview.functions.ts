"use server";

// Powers the in-app "internal browser" preview: instead of navigating away
// or opening a new tab, external links (grant sources, funder sites,
// citation evidence) open a reader-mode preview built from the same
// scrape-fallback chain the Discoverer/Enricher already use. Most real
// funder/gov sites send their own X-Frame-Options/frame-ancestors headers
// that make true iframing impossible to bypass from the embedding page (and
// this app's own CSP already sets frame-ancestors 'none') — a clean
// reader-mode extract, with an honest "open original" fallback for pages
// that need live interaction, is the feasible version of this feature.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSafeExternalUrl } from "@/lib/external-preview.shared";

const MAX_PREVIEW_CHARS = 20_000;

export const previewExternalUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ url: z.string().url() }).parse(i))
  .handler(async ({ data }) => {
    if (!isSafeExternalUrl(data.url)) {
      return { ok: false as const, url: data.url, error: "url_not_allowed" };
    }
    const { scrapeWithFallback } = await import("@/lib/web-fetch.server");
    const page = await scrapeWithFallback(data.url, { minContentChars: 80, skipFirecrawl: true });
    if (!page.ok) {
      return { ok: false as const, url: data.url, error: page.error };
    }
    let hostname = data.url;
    try {
      hostname = new URL(page.url).hostname;
    } catch {
      /* keep raw url as fallback label */
    }
    return {
      ok: true as const,
      url: page.url,
      title: page.title?.trim() || hostname,
      markdown: page.markdown.slice(0, MAX_PREVIEW_CHARS),
      truncated: page.markdown.length > MAX_PREVIEW_CHARS,
      via: page.via,
    };
  });
