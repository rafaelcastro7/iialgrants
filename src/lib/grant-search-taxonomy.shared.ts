export type QueryExpansion = {
  normalizedQuery: string;
  lexicalQueries: string[];
  semanticQuery: string;
  concepts: string[];
  suppressSemantic: boolean;
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const rules: Array<{ concept: string; patterns: string[]; expansions: string[] }> = [
  {
    concept: "youth-employment",
    patterns: ["hire young graduates", "young graduates", "youth employment"],
    expansions: ["youth employment program", "graduate employment"],
  },
  {
    concept: "healthy-aging",
    patterns: ["healthy aging", "vieillissement en sante", "age in place"],
    expansions: ["healthy aging", "older Canadians age in place", "community living lab"],
  },
  {
    concept: "rise-germany",
    patterns: ["rise germany", "rise gri", "german research internship"],
    expansions: ["RISE Globalink Research Internship", "German university research internship"],
  },
  {
    concept: "quebec-ai-tax-credit",
    patterns: ["quebec ai tax credit", "credit impot ia", "credit d impot ia"],
    expansions: [
      "artificial intelligence tax credit Quebec",
      "crédit d'impôt intelligence artificielle",
      "Investissement Québec attestations crédits impôt",
    ],
  },
  {
    concept: "international-research",
    patterns: ["international collaboration", "globalink award", "globalink internship"],
    expansions: ["international research collaboration", "Globalink research award internship"],
  },
  {
    concept: "us-americas-funders",
    patterns: [
      "us funders",
      "usa grants",
      "us federal",
      "gates foundation",
      "ford foundation",
      "nsf",
      "nih",
      "usaid",
      "bid",
      "idb",
      "caf",
      "conacyt",
      "fapesp",
      "anid",
      "minciencias",
    ],
    expansions: [
      "US Federal Agency",
      "Bill & Melinda Gates Foundation",
      "Ford Foundation",
      "Inter-American Development Bank",
      "CAF Development Bank",
      "National Science Foundation",
    ],
  },
  {
    // Open-data sources list these bodies by their full legal name only
    // ("Natural Sciences and Engineering Research Council of Canada"), so a
    // search for the acronym everyone actually types matched nothing.
    concept: "canadian-research-councils",
    patterns: ["nserc", "crsng", "sshrc", "crsh", "cihr", "irsc", "tri council", "tri-council"],
    expansions: [
      "Natural Sciences and Engineering Research Council of Canada",
      "Social Sciences and Humanities Research Council of Canada",
      "Canadian Institutes of Health Research",
    ],
  },
  {
    concept: "canadian-innovation-agencies",
    patterns: ["irap", "nrc irap", "cnrc", "pari", "national research council"],
    expansions: ["National Research Council Canada", "Industrial Research Assistance Program"],
  },
  {
    concept: "us-health-research",
    patterns: ["nih", "cdc", "hhs", "national institutes of health"],
    expansions: [
      "National Institutes of Health",
      "Centers for Disease Control and Prevention",
      "Department of Health and Human Services",
    ],
  },
];

export function expandGrantSearchQuery(query: string, maxLexicalQueries = 4): QueryExpansion {
  const normalizedQuery = normalize(query);
  const suppressSemantic = /\b(privacy|policy|terms of use|contact|about us|login|sign in)\b/.test(
    normalizedQuery,
  );
  const matchedRules = rules.filter((rule) =>
    rule.patterns.some((pattern) => normalizedQuery.includes(normalize(pattern))),
  );
  const concepts = matchedRules.map((rule) => rule.concept);
  const expansions = matchedRules.flatMap((rule) => rule.expansions);
  const lexicalQueries = [...new Set([query.trim(), ...expansions])]
    .filter((value) => value.length >= 2)
    .slice(0, Math.max(1, maxLexicalQueries));
  return {
    normalizedQuery,
    lexicalQueries,
    semanticQuery: [...new Set([query.trim(), ...expansions])].join(" | "),
    concepts,
    suppressSemantic,
  };
}
