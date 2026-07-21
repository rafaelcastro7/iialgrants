// Tri-Council + federal research funders ingester.
//
// The three federal granting agencies (NSERC, SSHRC, CIHR) plus the core
// federal research-funding ecosystem (CFI, Genome Canada, Canada Research
// Chairs, New Frontiers in Research Fund, Mitacs) are the backbone of Canadian
// research funding. They are stable, canonical funders with fixed .gc.ca /
// well-known domains, so we register them as high-signal funder candidates
// rather than scraping a fragile endpoint. The Discoverer then crawls each
// funder's site for individual grant programs.
//
// Idempotent by design: findDuplicate() in the orchestrator matches existing
// funders (e.g. CIHR) by fuzzy name, so re-runs never create duplicates.
//
// disbursed_annual figures are approximate public budget magnitudes (CAD),
// used only as a dedup/scoring signal — never surfaced to users as fact.

import type { RawCandidate } from "./scoring.server";

type SeedFunder = {
  name: string;
  name_fr?: string | null;
  website: string;
  disbursed_annual: number;
};

const TRI_COUNCIL_FUNDERS: SeedFunder[] = [
  {
    name: "Natural Sciences and Engineering Research Council of Canada",
    name_fr: "Conseil de recherches en sciences naturelles et en génie du Canada",
    website: "https://www.nserc-crsng.gc.ca",
    disbursed_annual: 1_300_000_000,
  },
  {
    name: "Social Sciences and Humanities Research Council of Canada",
    name_fr: "Conseil de recherches en sciences humaines du Canada",
    website: "https://www.sshrc-crsh.gc.ca",
    disbursed_annual: 1_000_000_000,
  },
  {
    name: "Canadian Institutes of Health Research",
    name_fr: "Instituts de recherche en santé du Canada",
    website: "https://cihr-irsc.gc.ca",
    disbursed_annual: 1_200_000_000,
  },
  {
    name: "Canada Foundation for Innovation",
    name_fr: "Fondation canadienne pour l'innovation",
    website: "https://www.innovation.ca",
    disbursed_annual: 500_000_000,
  },
  {
    name: "Genome Canada",
    name_fr: "Génome Canada",
    website: "https://genomecanada.ca",
    disbursed_annual: 200_000_000,
  },
  {
    name: "Canada Research Chairs Program",
    name_fr: "Programme des chaires de recherche du Canada",
    website: "https://www.chairs-chaires.gc.ca",
    disbursed_annual: 300_000_000,
  },
  {
    name: "New Frontiers in Research Fund",
    name_fr: "Fonds Nouvelles frontières en recherche",
    website: "https://www.sshrc-crsh.gc.ca/funding-financement/nfrf-fnfr/index-eng.aspx",
    disbursed_annual: 120_000_000,
  },
  {
    name: "Mitacs",
    name_fr: "Mitacs",
    website: "https://www.mitacs.ca",
    disbursed_annual: 200_000_000,
  },
];

export async function fetchTriCouncilFunders(): Promise<RawCandidate[]> {
  return TRI_COUNCIL_FUNDERS.map((f) => ({
    name: f.name,
    name_fr: f.name_fr ?? null,
    province: null, // federal
    funder_type: "Federal research funder",
    website: f.website,
    source_signals: ["tri_council"],
    disbursed_annual: f.disbursed_annual,
    raw_metadata: { tier: "B", curated: true },
  }));
}
