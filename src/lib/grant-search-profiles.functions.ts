import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { SearchFeedbackInput, SearchProfileInput } from "@/lib/grant-search-profiles.shared";

export const listGrantSearchProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("grant_search_profiles")
      .select("*")
      .eq("user_id", context.userId)
      .eq("active", true)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { profiles: data ?? [] };
  });

export const createGrantSearchProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SearchProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: userProfile } = await context.supabase
      .from("profiles")
      .select("org_id")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: created, error } = await context.supabase
      .from("grant_search_profiles")
      .insert({ ...data, user_id: context.userId, org_id: userProfile?.org_id ?? null })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { profile: created };
  });

export const updateGrantSearchProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), profile: SearchProfileInput }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase
      .from("grant_search_profiles")
      .update(data.profile)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { profile: updated };
  });

export const deleteGrantSearchProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: archived, error } = await context.supabase
      .from("grant_search_profiles")
      .update({ active: false })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!archived) throw new Error("Search profile not found");
    return { ok: true, archived: true };
  });

export const recordGrantSearchFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SearchFeedbackInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: feedback, error } = await context.supabase.rpc("record_grant_search_feedback", {
      p_profile_id: data.profile_id,
      p_grant_id: data.grant_id,
      p_action: data.action,
      p_reason: data.reason ?? undefined,
      p_note: data.note ?? undefined,
      p_query_text: data.query_text ?? undefined,
      p_rank_position: data.rank_position ?? undefined,
      p_score_snapshot: data.score_snapshot as Json,
    });
    if (error) throw new Error(error.message);
    return { feedback };
  });

export const listGrantSearchFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ profileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: feedback, error } = await context.supabase
      .from("grant_search_feedback")
      .select("*")
      .eq("profile_id", data.profileId)
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { feedback: feedback ?? [] };
  });
