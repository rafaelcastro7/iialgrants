// Deterministic eligibility taxonomy classifier (EN/FR).
// Returns matched eligibility tags with evidence snippets.

import { windowAround } from "@/agents/evidence.server";

type Rule = { tag: string; patterns: RegExp[] };

const RULES: Rule[] = [
  { tag: "smb", patterns: [
    /\bsmall\s+(?:and\s+medium[-\s]sized?)?\s*(?:business|enterprise)es?\b/i,
    /\bSMEs?\b/, /\bSMBs?\b/,
    /\bpetites?\s+(?:et\s+moyennes?)?\s+entreprises?\b/i, /\bPME\b/,
  ]},
  { tag: "startup", patterns: [/\bstart[-\s]?ups?\b/i, /\bjeunes?\s+entreprises?\b/i, /\bentreprises?\s+en\s+démarrage\b/i] },
  { tag: "non_profit", patterns: [
    /\bnon[-\s]?profits?\b/i, /\bnot[-\s]for[-\s]profits?\b/i, /\bNPOs?\b/,
    /\borganisations?\s+(?:à\s+but\s+non\s+lucratif|sans\s+but\s+lucratif)\b/i, /\bOBNL\b/, /\bOSBL\b/,
  ]},
  { tag: "indigenous", patterns: [
    /\bindigenous\b/i, /\bfirst\s+nations?\b/i, /\bmétis\b/i, /\binuit\b/i,
    /\bautochtones?\b/i, /\bpremières?\s+nations?\b/i,
  ]},
  { tag: "quebec_based", patterns: [/\bbased\s+in\s+(?:québec|quebec)\b/i, /\bétablie?s?\s+au\s+québec\b/i, /\bquébécoises?\b/i] },
  { tag: "canadian_owned", patterns: [/\bcanadian[-\s]owned\b/i, /\bincorporated\s+in\s+canada\b/i, /\bincorporée?s?\s+au\s+canada\b/i] },
  { tag: "research_university", patterns: [/\buniversit(?:y|ies|é|és)\b/i, /\bresearch\s+institut(?:e|ion)s?\b/i, /\bcentres?\s+de\s+recherche\b/i] },
  { tag: "women_owned", patterns: [/\bwomen[-\s]owned\b/i, /\bappartenant\s+à\s+des\s+femmes\b/i] },
  { tag: "clean_tech", patterns: [/\bclean\s*tech(?:nology)?\b/i, /\btechnologies?\s+propres\b/i] },
  { tag: "ai_ml", patterns: [/\bartificial\s+intelligence\b/i, /\bmachine\s+learning\b/i, /\bintelligence\s+artificielle\b/i, /\bIA\b/] },
];

export type EligibilityMatch = {
  tag: string;
  snippet: string;
  matchOffset: number;
};

export function extractEligibility(text: string): EligibilityMatch[] {
  if (!text) return [];
  const out: EligibilityMatch[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    for (const re of rule.patterns) {
      const m = re.exec(text);
      if (m && !seen.has(rule.tag)) {
        out.push({
          tag: rule.tag,
          snippet: windowAround(text, m.index, m[0].length),
          matchOffset: m.index,
        });
        seen.add(rule.tag);
        break;
      }
    }
  }
  return out;
}
