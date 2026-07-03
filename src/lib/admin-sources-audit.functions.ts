// Per-funder activity rollup for the admin Sources console.
// Surfaces: grants discovered, evidences extracted, last activity timestamp,
// and the last 5 grants impacted — so admins can see that each funder is
// really being scanned AND that screening rules are actually applied.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export type FunderActivityRow = {
  funder_id: string;
  funder_name: string;
  source_url: string | null;
  grants_total: number;
  grants_enriched: number;
  grants_scored: number;
  grants_shortlisted: number;
  evidences_total: number;
  last_discovered_at: string | null;
  last_evidence_at: string | null;
  recent_grants: { id: string; title: string; status: string; fit_score: number | null }[];
};

export const funderActivityRollup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FunderActivityRow[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: funders, error: fErr } = await supabaseAdmin
      .from("funders")
      .select("id, name, source_url")
      .eq("active", true)
      .order("name");
    if (fErr) throw fErr;

    const { data: grants, error: gErr } = await supabaseAdmin
      .from("grants")
      .select("id, funder_id, title, status, fit_score, discovered_at, enriched_at, scored_at")
      .order("discovered_at", { ascending: false });
    if (gErr) throw gErr;

    const grantIds = (grants ?? []).map((g) => g.id);
    const evMap = new Map<string, { count: number; last: string | null }>();
    if (grantIds.length) {
      const { data: ev } = await supabaseAdmin
        .from("evidence_spans")
        .select("grant_id, created_at")
        .in("grant_id", grantIds);
      for (const e of ev ?? []) {
        const m = evMap.get(e.grant_id) ?? { count: 0, last: null };
        m.count += 1;
        if (!m.last || (e.created_at && e.created_at > m.last)) m.last = e.created_at;
        evMap.set(e.grant_id, m);
      }
    }

    return (funders ?? []).map((f) => {
      const own = (grants ?? []).filter((g) => g.funder_id === f.id);
      let evTotal = 0;
      let lastEv: string | null = null;
      let lastDisc: string | null = null;
      for (const g of own) {
        const m = evMap.get(g.id);
        if (m) {
          evTotal += m.count;
          if (m.last && (!lastEv || m.last > lastEv)) lastEv = m.last;
        }
        if (g.discovered_at && (!lastDisc || g.discovered_at > lastDisc))
          lastDisc = g.discovered_at;
      }
      return {
        funder_id: f.id,
        funder_name: f.name,
        source_url: f.source_url,
        grants_total: own.length,
        grants_enriched: own.filter((g) => !!g.enriched_at).length,
        grants_scored: own.filter((g) => !!g.scored_at).length,
        grants_shortlisted: own.filter(
          (g) => g.status === "shortlisted" || g.status === "in_proposal",
        ).length,
        evidences_total: evTotal,
        last_discovered_at: lastDisc,
        last_evidence_at: lastEv,
        recent_grants: own.slice(0, 5).map((g) => ({
          id: g.id,
          title: g.title,
          status: g.status,
          fit_score: g.fit_score,
        })),
      };
    });
  });
