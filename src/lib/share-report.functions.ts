import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AxisScore } from "@/agents/fit-rules.shared";

// Shareable fit reports (Grantable-style): an authenticated user mints an
// unguessable token for one grant; anyone with the link sees a READ-ONLY
// report (grant basics + evaluation + axis breakdown + evidence) without
// logging in. Public access is server-side only, via the service role, after
// validating token + expiry + revocation — no table is publicly readable.

export const createShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ grantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    // Reuse an active link for this grant+user when one exists.
    const { data: existing } = await context.supabase
      .from("shared_fit_reports" as never)
      .select("token, expires_at")
      .eq("grant_id", data.grantId)
      .eq("user_id", context.userId)
      .eq("revoked", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (existing) return { token: (existing as { token: string }).token, reused: true };

    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(16).toString("hex");
    const { error } = await context.supabase.from("shared_fit_reports" as never).insert({
      token,
      grant_id: data.grantId,
      user_id: context.userId,
    } as never);
    if (error) throw new Error(`share_link_create_failed: ${error.message}`);
    return { token, reused: false };
  });

export type SharedReport = {
  grant: {
    title: string;
    summary: string | null;
    url: string;
    deadline: string | null;
    amount_cad_min: number | null;
    amount_cad_max: number | null;
    sectors: string[] | null;
    funder: { name: string; jurisdiction: string | null } | null;
  };
  evaluation: {
    fit_score: number;
    eligibility_pass: boolean;
    rationale_en: string;
    axis_breakdown: AxisScore[] | null;
    created_at: string;
  } | null;
  evidence: Array<{
    field: string;
    snippet: string | null;
    source_url: string | null;
    extraction_method: string;
  }>;
  generated_at: string;
};

// PUBLIC: no auth middleware. The token IS the credential.
export const getSharedReport = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ token: z.string().regex(/^[a-f0-9]{32}$/) }).parse(i))
  .handler(async ({ data }): Promise<SharedReport> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: share } = await supabaseAdmin
      .from("shared_fit_reports" as never)
      .select("grant_id, user_id, expires_at, revoked")
      .eq("token", data.token)
      .maybeSingle();
    const s = share as {
      grant_id: string;
      user_id: string;
      expires_at: string;
      revoked: boolean;
    } | null;
    if (!s || s.revoked || new Date(s.expires_at).getTime() < Date.now()) {
      throw new Error("report_not_found_or_expired");
    }

    const [{ data: grant }, { data: evaluation }, { data: evidence }] = await Promise.all([
      supabaseAdmin
        .from("grants")
        .select(
          "title, summary, url, deadline, amount_cad_min, amount_cad_max, sectors, funder:funders(name, jurisdiction)",
        )
        .eq("id", s.grant_id)
        .maybeSingle(),
      supabaseAdmin
        .from("grant_evaluations")
        .select("fit_score, eligibility_pass, rationale_en, axis_breakdown, created_at")
        .eq("grant_id", s.grant_id)
        .eq("user_id", s.user_id)
        .maybeSingle(),
      supabaseAdmin
        .from("evidence_spans")
        .select("field, snippet, source_url, extraction_method")
        .eq("grant_id", s.grant_id)
        .order("confidence", { ascending: false })
        .limit(10),
    ]);
    if (!grant) throw new Error("report_not_found_or_expired");

    const funderRaw = (grant as { funder: unknown }).funder;
    const funder = (Array.isArray(funderRaw) ? funderRaw[0] : funderRaw) as {
      name: string;
      jurisdiction: string | null;
    } | null;

    return {
      grant: { ...(grant as Omit<SharedReport["grant"], "funder">), funder },
      evaluation: evaluation as SharedReport["evaluation"],
      evidence: (evidence ?? []) as SharedReport["evidence"],
      generated_at: new Date().toISOString(),
    };
  });
