import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Returns all evidence spans for a grant, grouped by field.
// Used by the drill-down EvidencePanel UI.
export const getGrantEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ grantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("evidence_spans")
      .select("id, agent, field, value, source_url, snippet, snippet_offset, extraction_method, confidence, model, created_at")
      .eq("grant_id", data.grantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Group by field for the UI panel.
    const byField: Record<string, Array<typeof rows[number]>> = {};
    for (const r of rows ?? []) {
      (byField[r.field] ||= []).push(r);
    }
    return { spans: rows ?? [], byField };
  });
