// Philanthropic Foundations Canada — member list scraper.
// Uses Firecrawl JSON extraction (LLM-on-server) to pull a structured list.
// Falls back to empty array if Firecrawl is unavailable.

import type { RawCandidate } from "./scoring";

const PFC_URL = "https://pfc.ca/memberslist/";

const PFC_SCHEMA = {
  type: "object",
  properties: {
    members: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          website: { type: ["string", "null"] },
          province: { type: ["string", "null"], description: "Two-letter Canadian province code if visible" },
        },
        required: ["name"],
      },
    },
  },
  required: ["members"],
} as const;

export async function scrapePfcMembers(): Promise<RawCandidate[]> {
  const { firecrawlAvailable, firecrawlScrape } = await import("@/lib/firecrawl.server");
  if (!firecrawlAvailable()) return [];
  const r = await firecrawlScrape(PFC_URL, {
    jsonSchema: PFC_SCHEMA,
    jsonPrompt:
      "Extract every grantmaking foundation listed as a Philanthropic Foundations Canada member. " +
      "Return name, website URL if linked, and the Canadian province code if visible.",
  });
  if (!r.ok) return [];
  const members = ((r.json as { members?: unknown })?.members) as Array<{ name?: string; website?: string | null; province?: string | null }> | undefined;
  if (!Array.isArray(members)) return [];
  const tag = "pfc_members:" + new Date().toISOString().slice(0, 7);
  return members
    .filter((m) => typeof m.name === "string" && m.name.trim().length > 2)
    .map((m) => ({
      name: m.name!.trim(),
      website: m.website ?? null,
      province: m.province ?? null,
      funder_type: "foundation_private",
      source_signals: [tag],
      raw_metadata: { source: "pfc.ca/memberslist" },
    }));
}
