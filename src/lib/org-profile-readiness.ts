export type GrantReadinessProfile = {
  org_name?: string | null;
  legal_name?: string | null;
  mission?: string | null;
  registration_status?: string | null;
  applicant_types?: string[] | null;
  sectors?: string[] | null;
  jurisdictions?: string[] | null;
  activities?: string[] | null;
  capabilities?: string[] | null;
  populations_served?: string[] | null;
  operating_regions?: string[] | null;
  annual_budget_cad?: number | null;
  years_operating?: number | null;
  employee_count?: number | null;
  funding_min_cad?: number | null;
  funding_max_cad?: number | null;
  cost_share_max_pct?: number | null;
};

export type ProfileReadinessItem = {
  key: keyof GrantReadinessProfile;
  label: string;
  complete: boolean;
  critical: boolean;
  why: string;
};

const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const hasItems = (value: unknown) => Array.isArray(value) && value.some(hasText);
const hasNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);

/** Deterministic profile readiness used by onboarding and matching safeguards. */
export function computeOrgProfileReadiness(profile: GrantReadinessProfile | null | undefined) {
  const p = profile ?? {};
  const items: ProfileReadinessItem[] = [
    {
      key: "org_name",
      label: "Organization identity",
      complete: hasText(p.org_name),
      critical: true,
      why: "Names the applicant used in applications and evidence.",
    },
    {
      key: "registration_status",
      label: "Legal / registration status",
      complete: hasText(p.registration_status),
      critical: true,
      why: "Most calls restrict which legal applicant types may apply.",
    },
    {
      key: "applicant_types",
      label: "Eligible applicant types",
      complete: hasItems(p.applicant_types),
      critical: true,
      why: "Prevents charity, nonprofit, company and public-body false positives.",
    },
    {
      key: "jurisdictions",
      label: "Legal jurisdictions",
      complete: hasItems(p.jurisdictions),
      critical: true,
      why: "Determines whether IIAL is legally located in an eligible market.",
    },
    {
      key: "operating_regions",
      label: "Regions served",
      complete: hasItems(p.operating_regions),
      critical: false,
      why: "Separates incorporation from where project benefits are delivered.",
    },
    {
      key: "mission",
      label: "Mission",
      complete: hasText(p.mission),
      critical: true,
      why: "Grounds strategic-fit explanations and proposal reuse.",
    },
    {
      key: "sectors",
      label: "Program sectors",
      complete: hasItems(p.sectors),
      critical: true,
      why: "Drives opportunity retrieval and sector fit.",
    },
    {
      key: "activities",
      label: "Activities and programs",
      complete: hasItems(p.activities),
      critical: false,
      why: "Matches what IIAL actually delivers, not only broad themes.",
    },
    {
      key: "capabilities",
      label: "Delivery capabilities",
      complete: hasItems(p.capabilities),
      critical: false,
      why: "Supports feasibility and organizational-capacity sections.",
    },
    {
      key: "populations_served",
      label: "Populations served",
      complete: hasItems(p.populations_served),
      critical: false,
      why: "Improves beneficiary and equity-focused matching.",
    },
    {
      key: "annual_budget_cad",
      label: "Annual operating budget",
      complete: hasNumber(p.annual_budget_cad),
      critical: false,
      why: "Detects capacity and applicant-size restrictions.",
    },
    {
      key: "funding_min_cad",
      label: "Useful award floor",
      complete: hasNumber(p.funding_min_cad),
      critical: false,
      why: "Avoids spending proposal time on awards too small to justify pursuit.",
    },
    {
      key: "cost_share_max_pct",
      label: "Maximum affordable cost share",
      complete: hasNumber(p.cost_share_max_pct),
      critical: false,
      why: "Makes matching-fund feasibility explicit before drafting.",
    },
  ];

  const complete = items.filter((item) => item.complete).length;
  const criticalMissing = items.filter((item) => item.critical && !item.complete);
  return {
    items,
    score: Math.round((complete / items.length) * 100),
    complete,
    total: items.length,
    criticalMissing,
    readyForVerifiedMatching: criticalMissing.length === 0,
  };
}

