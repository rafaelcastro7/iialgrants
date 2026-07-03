// Deterministic sector classifier (NAICS-lite, EN/FR). No LLM, no credits.

import { windowAround } from "@/agents/evidence.server";

// JS \b does not work next to accented characters (é is a non-word char), so
// French keywords that start/end with accents need explicit letter lookarounds.
const NOT_LETTER_BEFORE = String.raw`(?<![A-Za-zÀ-ÿ])`;
const NOT_LETTER_AFTER = String.raw`(?![A-Za-zÀ-ÿ])`;

const SECTOR_KEYWORDS: Record<string, RegExp[]> = {
  agriculture: [/\bagricultur(?:e|al)\b/i, /\bfarming\b/i, /\bagricole\b/i],
  manufacturing: [/\bmanufacturing\b/i, /\bfabrication\b/i, /\bmanufacturière?\b/i],
  technology: [/\btechnolog(?:y|ies)\b/i, /\bsoftware\b/i, /\blogiciels?\b/i, /\bIT\b/, /\bTI\b/],
  ai: [
    /\bartificial\s+intelligence\b/i,
    /\bmachine\s+learning\b/i,
    /\bintelligence\s+artificielle\b/i,
  ],
  cleantech: [
    /\bclean\s*tech(?:nology)?\b/i,
    /\btechnologies?\s+propres\b/i,
    /\brenewable\s+energy\b/i,
    new RegExp(String.raw`${NOT_LETTER_BEFORE}énergies?\s+renouvelables?\b`, "i"),
  ],
  health: [
    /\bhealth(?:care)?\b/i,
    /\bmedical\b/i,
    new RegExp(String.raw`${NOT_LETTER_BEFORE}santé${NOT_LETTER_AFTER}`, "i"),
    new RegExp(String.raw`${NOT_LETTER_BEFORE}médical\b`, "i"),
    /\bbiotech\b/i,
  ],
  aerospace: [/\baerospace\b/i, /\baéronautique\b/i, /\baviation\b/i],
  arts_culture: [/\barts?\b/i, /\bculture\b/i, /\bcréation\s+(?:culturelle|artistique)\b/i],
  tourism: [/\btourism\b/i, /\btourisme\b/i, /\bhospitality\b/i, /\bhôtellerie\b/i],
  construction: [/\bconstruction\b/i, /\bbâtiment\b/i],
  retail: [/\bretail\b/i, /\bcommerce\s+de\s+détail\b/i, /\be-?commerce\b/i],
  finance: [/\bfintech\b/i, /\bfinancial\s+services\b/i, /\bservices?\s+financiers?\b/i],
  education: [
    /\beducation\b/i,
    new RegExp(String.raw`${NOT_LETTER_BEFORE}éducation\b`, "i"),
    /\bschools?\b/i,
    new RegExp(String.raw`${NOT_LETTER_BEFORE}écoles?\b`, "i"),
  ],
  forestry: [/\bforestry\b/i, /\bforestière\b/i, /\bbois\b/i],
  mining: [/\bmining\b/i, /\bminière?\b/i, /\bminérals?\b/i],
};

export type SectorMatch = {
  sector: string;
  snippet: string;
  matchOffset: number;
};

export function extractSectors(text: string): SectorMatch[] {
  if (!text) return [];
  const out: SectorMatch[] = [];
  const seen = new Set<string>();
  for (const [sector, patterns] of Object.entries(SECTOR_KEYWORDS)) {
    for (const re of patterns) {
      const m = re.exec(text);
      if (m && !seen.has(sector)) {
        out.push({
          sector,
          snippet: windowAround(text, m.index, m[0].length),
          matchOffset: m.index,
        });
        seen.add(sector);
        break;
      }
    }
  }
  return out;
}
