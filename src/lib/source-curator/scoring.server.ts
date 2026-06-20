// Scoring + dedup for funder candidates.
// Pure functions; no I/O except a Supabase lookup in `findDuplicate`.

export type RawCandidate = {
  name: string;
  name_fr?: string | null;
  bn_number?: string | null;     // CRA Business Number (9 digits, primary dedup key)
  province?: string | null;
  funder_type?: string | null;
  website?: string | null;
  source_signals: string[];      // e.g. ["tbs_gc:2026-06", "pfc_members"]
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
  const A = bi(na), B = bi(nb);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export function normalizeName(s: string): string {
  return s.toLowerCase()
    .replace(/\b(inc|incorporated|ltd|limited|llc|corp|corporation|foundation|fondation|society|société|association)\b/g, "")
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

/** Looks up by BN first, then by fuzzy name (>= 0.88). Service-role required. */
export async function findDuplicate(c: RawCandidate): Promise<DupeResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // 1. BN match (deterministic)
  if (c.bn_number) {
    const bn = c.bn_number.replace(/\s/g, "").slice(0, 9);
    const { data: f } = await supabaseAdmin.from("funders").select("id").eq("bn_number", bn).maybeSingle();
    if (f?.id) return { kind: "existing_funder", funderId: f.id };
    const { data: c2 } = await supabaseAdmin.from("funder_candidates").select("id,status").eq("bn_number", bn).maybeSingle();
    if (c2?.id) return { kind: "existing_candidate", candidateId: c2.id, status: c2.status };
  }
  // 2. Fuzzy name match within province
  const { data: funders } = await supabaseAdmin
    .from("funders").select("id,name").limit(2000);
  for (const f of funders ?? []) {
    if (nameSimilarity(c.name, f.name as string) >= 0.88) return { kind: "existing_funder", funderId: f.id as string };
  }
  const { data: cands } = await supabaseAdmin
    .from("funder_candidates").select("id,name,status").limit(2000);
  for (const ec of cands ?? []) {
    if (nameSimilarity(c.name, ec.name as string) >= 0.88) {
      return { kind: "existing_candidate", candidateId: ec.id as string, status: ec.status as string };
    }
  }
  return { kind: "new" };
}

export const AUTO_APPROVE_THRESHOLD = 80;
export const REVIEW_MIN_THRESHOLD = 40;
