// Scoring + dedup for funder candidates.
// Pure functions; no I/O except a Supabase lookup in `findDuplicate`.

export type RawCandidate = {
  name: string;
  name_fr?: string | null;
  bn_number?: string | null; // CRA Business Number (9 digits, primary dedup key)
  province?: string | null;
  funder_type?: string | null;
  website?: string | null;
  source_signals: string[]; // e.g. ["tbs_gc:2026-06", "pfc_members"]
  raw_metadata?: Record<string, unknown>;
  disbursed_annual?: number | null;
};

export type ScoredCandidate = RawCandidate & { score: number };

// Jaro-Winkler-ish: cheap, dependency-free name similarity (good enough for dedup).
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // Dice coefficient on bigrams (fast, decent for org names).
  const bi = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const A = bi(na),
    B = bi(nb);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(
      /\b(inc|incorporated|ltd|limited|llc|corp|corporation|foundation|fondation|society|société|association)\b/g,
      "",
    )
    .replace(/\bsociete\b/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreCandidate(c: RawCandidate): number {
  let score = 0;
  if (c.bn_number && /^\d{9}/.test(c.bn_number)) score += 25;
  if (c.disbursed_annual && c.disbursed_annual > 0) score += 20;
  if (c.website) score += 15;
  if (c.source_signals.length >= 2) score += 10;
  if (c.province) score += 5;
  if (c.funder_type) score += 5;
  // Bonus for clearly-canadian provinces
  if (c.province && /^(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)$/i.test(c.province)) score += 5;
  return Math.min(100, score);
}

export type DupeResult =
  | { kind: "existing_funder"; funderId: string }
  | { kind: "existing_candidate"; candidateId: string; status: string }
  | { kind: "new" };

type ExistingFunderRow = { id: string; name: string | null };
type ExistingCandidateRow = { id: string; name: string | null; status: string | null };

const DEDUP_PAGE_SIZE = 1000;
const FUZZY_DEDUP_THRESHOLD = 0.88;

/**
 * Looks up by BN first, then by fuzzy name (>= 0.88). Service-role required.
 *
 * The fuzzy pass is NOT scoped by province — it checks the candidate's name
 * against every known funder/candidate regardless of jurisdiction. That is
 * intentional: many funders here are federal/national (province = null) and
 * a near-identical name across two provinces is still almost always the same
 * org (e.g. a chapter) rather than a coincidence, so scoping by province would
 * mostly just create missed duplicates. The fuzzy scan is paged
 * deterministically so dedup coverage does not silently stop at a fixed
 * table-size cutoff.
 */
export async function findDuplicate(c: RawCandidate): Promise<DupeResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // 1. BN match (deterministic)
  if (c.bn_number) {
    const bn = c.bn_number.replace(/\s/g, "").slice(0, 9);
    const { data: f } = await supabaseAdmin
      .from("funders")
      .select("id")
      .eq("bn_number", bn)
      .maybeSingle();
    if (f?.id) return { kind: "existing_funder", funderId: f.id };
    const { data: c2 } = await supabaseAdmin
      .from("funder_candidates")
      .select("id,status")
      .eq("bn_number", bn)
      .maybeSingle();
    if (c2?.id) return { kind: "existing_candidate", candidateId: c2.id, status: c2.status };
  }
  // 2. Fuzzy name match across all rows, paged to avoid fixed-size blind spots.
  for (let from = 0; ; from += DEDUP_PAGE_SIZE) {
    const { data: funders, error } = await supabaseAdmin
      .from("funders")
      .select("id,name")
      .order("id", { ascending: true })
      .range(from, from + DEDUP_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const match = findDuplicateInRows(c, funders ?? [], []);
    if (match.kind !== "new") return match;
    if ((funders ?? []).length < DEDUP_PAGE_SIZE) break;
  }

  for (let from = 0; ; from += DEDUP_PAGE_SIZE) {
    const { data: cands, error } = await supabaseAdmin
      .from("funder_candidates")
      .select("id,name,status")
      .order("id", { ascending: true })
      .range(from, from + DEDUP_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const match = findDuplicateInRows(c, [], cands ?? []);
    if (match.kind !== "new") return match;
    if ((cands ?? []).length < DEDUP_PAGE_SIZE) break;
  }
  return { kind: "new" };
}

export function findDuplicateInRows(
  c: Pick<RawCandidate, "name">,
  funders: ExistingFunderRow[],
  candidates: ExistingCandidateRow[],
): DupeResult {
  for (const f of funders) {
    if (f.name && nameSimilarity(c.name, f.name) >= FUZZY_DEDUP_THRESHOLD) {
      return { kind: "existing_funder", funderId: f.id };
    }
  }
  for (const ec of candidates) {
    if (ec.name && nameSimilarity(c.name, ec.name) >= FUZZY_DEDUP_THRESHOLD) {
      return {
        kind: "existing_candidate",
        candidateId: ec.id,
        status: ec.status ?? "unknown",
      };
    }
  }
  return { kind: "new" };
}

export const AUTO_APPROVE_THRESHOLD = 80;
export const REVIEW_MIN_THRESHOLD = 40;
