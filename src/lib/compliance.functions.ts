import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Current policy versions (bump when text changes — drives consent revalidation).
export const POLICY_VERSIONS = {
  terms_of_service: "2026-06-19",
  privacy_policy: "2026-06-19",
  ai_processing: "2026-06-19",
  cross_border_transfer: "2026-06-19",
  marketing: "2026-06-19",
} as const;

const ConsentInput = z.object({
  consent_type: z.enum([
    "terms_of_service",
    "privacy_policy",
    "ai_processing",
    "cross_border_transfer",
    "marketing",
  ]),
  action: z.enum(["granted", "revoked"]),
  language: z.enum(["en", "fr"]).default("en"),
});

// PIPEDA / Quebec Law 25: append-only consent ledger.
export const recordConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ConsentInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const version = POLICY_VERSIONS[data.consent_type];
    const { error } = await supabase.from("consent_ledger").insert({
      user_id: userId,
      consent_type: data.consent_type,
      action: data.action,
      policy_version: version,
      language: data.language,
    });
    if (error) throw new Error(error.message);
    return { ok: true, policy_version: version };
  });

export const listMyConsents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("consent_ledger")
      .select("id, consent_type, action, policy_version, language, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// DSAR — Data Subject Access Request (PIPEDA Right of Access; Law 25 Right of Portability).
const DsarInput = z.object({
  kind: z.enum(["access", "export", "delete", "rectify"]),
  reason: z.string().max(2000).optional().nullable(),
});

export const createDsarRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => DsarInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("dsar_requests")
      .insert({ user_id: userId, kind: data.kind, reason: data.reason ?? null })
      .select("id, kind, status, created_at")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      user_id: userId,
      action: "dsar.request",
      resource_type: "dsar_requests",
      resource_id: row.id,
      metadata: { kind: data.kind },
    });
    return row;
  });

export const listMyDsarRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("dsar_requests")
      .select("id, kind, status, reason, result_url, created_at, completed_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Self-service data export — PIPEDA right of access in machine-readable JSON.
// Worker-safe: produces a JSON string for client-side download.
export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profile, org, proposals, submissions, outcomes, consents, dsar, knowledge] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("org_profiles").select("*").eq("user_id", userId),
        supabase.from("proposals").select("*").eq("user_id", userId),
        supabase.from("submissions").select("*").eq("user_id", userId),
        supabase.from("outcomes").select("*").eq("user_id", userId),
        supabase.from("consent_ledger").select("*").eq("user_id", userId),
        supabase.from("dsar_requests").select("*").eq("user_id", userId),
        supabase
          .from("knowledge_chunks")
          .select("id, source, language, content, created_at")
          .eq("user_id", userId),
      ]);

    const bundle = {
      _meta: {
        generated_at: new Date().toISOString(),
        user_id: userId,
        format: "iial.dsar.export.v1",
        jurisdiction: "CA",
        compliance: ["PIPEDA", "Quebec Law 25"],
      },
      profile: profile.data,
      org_profile: org.data ?? [],
      proposals: proposals.data ?? [],
      submissions: submissions.data ?? [],
      outcomes: outcomes.data ?? [],
      consents: consents.data ?? [],
      dsar_requests: dsar.data ?? [],
      knowledge_chunks: knowledge.data ?? [],
    };

    // Log audit event but never block on it.
    await supabase.from("audit_log").insert({
      user_id: userId,
      action: "dsar.export",
      resource_type: "self",
      resource_id: userId,
      metadata: {
        counts: {
          proposals: bundle.proposals.length,
          submissions: bundle.submissions.length,
        },
      },
    });

    return { json: JSON.stringify(bundle, null, 2) };
  });

// Self-service deletion request — creates a pending DSAR delete request.
// Actual hard-delete is performed by an admin (verified identity, retention checks).
export const requestAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ reason: z.string().max(2000).optional().nullable() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("dsar_requests")
      .insert({ user_id: userId, kind: "delete", reason: data.reason ?? null })
      .select("id, status, created_at")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      user_id: userId,
      action: "dsar.delete_requested",
      resource_type: "dsar_requests",
      resource_id: row.id,
    });
    return row;
  });
