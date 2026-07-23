// Federal regional development agencies + sector/provincial innovation
// funders. IIAL's funder catalog had only 12 rows (several inactive) — this
// registers the major stable, canonical Canadian SME funding bodies missing
// from it, so the Discoverer has real, verified sources to crawl for
// individual grant programs. Same pattern as tri-council.server.ts: fixed
// .gc.ca / well-known domains, registered as high-signal candidates rather
// than scraped from a fragile index page.
//
// Every URL below was verified live 2026-07-23 (HTTP 200 via a direct
// fetch — curl on this Windows machine has a schannel TLS quirk against
// canada.ca that made several of these look down when they aren't; Node's
// fetch confirmed the real status). Two initially-planned entries were
// dropped after verification: Sustainable Development Technology Canada
// (sdtc.ca does not resolve — its programs were folded into NRC IRAP a
// few years ago) and the commonly-cited "feddevontario.canada.ca" /
// "opportunitiesnb.ca" / "novascotiabusiness.com" domains, which are simply
// wrong — the correct current domains (feddev-ontario.canada.ca,
// onbcanada.ca, investnovascotia.ca) are used instead.

import type { RawCandidate } from "./scoring.server";

type SeedFunder = {
  name: string;
  name_fr?: string | null;
  province: string | null; // null = federal / nationwide
  funder_type: string;
  website: string;
  disbursed_annual: number | null;
};

const REGIONAL_DEVELOPMENT_FUNDERS: SeedFunder[] = [
  // --- Federal regional development agencies (cover every region) ---
  {
    name: "Atlantic Canada Opportunities Agency",
    name_fr: "Agence de promotion économique du Canada atlantique",
    province: null,
    funder_type: "Federal regional development agency",
    website: "https://www.canada.ca/en/atlantic-canada-opportunities.html",
    disbursed_annual: 300_000_000,
  },
  {
    name: "Canada Economic Development for Quebec Regions",
    name_fr: "Développement économique Canada pour les régions du Québec",
    province: "QC",
    funder_type: "Federal regional development agency",
    website: "https://www.canada.ca/en/economic-development-quebec-regions.html",
    disbursed_annual: 300_000_000,
  },
  {
    name: "FedDev Ontario",
    name_fr: "FedDev Ontario",
    province: "ON",
    funder_type: "Federal regional development agency",
    website: "https://feddev-ontario.canada.ca",
    disbursed_annual: 200_000_000,
  },
  {
    name: "FedNor",
    name_fr: "FedNor",
    province: "ON",
    funder_type: "Federal regional development agency",
    website: "https://fednor.canada.ca",
    disbursed_annual: 60_000_000,
  },
  {
    name: "Prairies Economic Development Canada",
    name_fr: "Développement économique Canada pour les Prairies",
    province: null,
    funder_type: "Federal regional development agency",
    website: "https://www.canada.ca/en/prairies-economic-development.html",
    disbursed_annual: 250_000_000,
  },
  {
    name: "Pacific Economic Development Canada",
    name_fr: "Développement économique Canada pour le Pacifique",
    province: "BC",
    funder_type: "Federal regional development agency",
    website: "https://www.canada.ca/en/pacific-economic-development.html",
    disbursed_annual: 150_000_000,
  },
  {
    name: "Canadian Northern Economic Development Agency",
    name_fr: "Agence canadienne de développement économique du Nord",
    province: null,
    funder_type: "Federal regional development agency",
    website: "https://www.cannor.gc.ca",
    disbursed_annual: 40_000_000,
  },
  // --- Sector-specific federal ---
  {
    name: "Natural Resources Canada",
    name_fr: "Ressources naturelles Canada",
    province: null,
    funder_type: "Federal sector funder (energy/resources)",
    website: "https://natural-resources.canada.ca",
    disbursed_annual: 500_000_000,
  },
  {
    name: "Futurpreneur Canada",
    name_fr: "Futurpreneur Canada",
    province: null,
    funder_type: "Federal non-profit (youth entrepreneurship)",
    website: "https://futurpreneur.ca",
    disbursed_annual: 30_000_000,
  },
  {
    name: "Business Development Bank of Canada",
    name_fr: "Banque de développement du Canada",
    province: null,
    funder_type: "Federal crown corporation (financing)",
    website: "https://www.bdc.ca",
    disbursed_annual: null,
  },
  {
    name: "Export Development Canada",
    name_fr: "Exportation et développement Canada",
    province: null,
    funder_type: "Federal crown corporation (export financing)",
    website: "https://www.edc.ca",
    disbursed_annual: null,
  },
  // --- Provincial innovation agencies ---
  {
    name: "Innovate BC",
    name_fr: null,
    province: "BC",
    funder_type: "Provincial innovation agency",
    website: "https://innovatebc.ca",
    disbursed_annual: 30_000_000,
  },
  {
    name: "Alberta Innovates",
    name_fr: null,
    province: "AB",
    funder_type: "Provincial innovation agency",
    website: "https://albertainnovates.ca",
    disbursed_annual: 150_000_000,
  },
  {
    name: "Innovation Saskatchewan",
    name_fr: null,
    province: "SK",
    funder_type: "Provincial innovation agency",
    website: "https://innovationsask.ca",
    disbursed_annual: 20_000_000,
  },
  {
    name: "Invest Nova Scotia",
    name_fr: null,
    province: "NS",
    funder_type: "Provincial innovation agency",
    website: "https://www.investnovascotia.ca",
    disbursed_annual: 40_000_000,
  },
  {
    name: "Opportunities New Brunswick",
    name_fr: null,
    province: "NB",
    funder_type: "Provincial economic development agency",
    website: "https://onbcanada.ca",
    disbursed_annual: 30_000_000,
  },
  {
    name: "Ontario Centre of Innovation",
    name_fr: "Centre ontarien d'innovation",
    province: "ON",
    funder_type: "Provincial innovation agency",
    website: "https://www.oc-innovation.ca",
    disbursed_annual: 30_000_000,
  },
];

export async function fetchRegionalDevelopmentFunders(): Promise<RawCandidate[]> {
  return REGIONAL_DEVELOPMENT_FUNDERS.map((f) => ({
    name: f.name,
    name_fr: f.name_fr ?? null,
    province: f.province,
    funder_type: f.funder_type,
    website: f.website,
    source_signals: ["regional_development"],
    disbursed_annual: f.disbursed_annual,
    raw_metadata: { tier: "B", curated: true },
  }));
}
