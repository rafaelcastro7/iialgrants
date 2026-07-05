import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function bumpProposalVersion(
  supabase: SupabaseClient<Database>,
  proposalId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("bump_proposal_version", {
    target_proposal_id: proposalId,
  });
  if (error) throw new Error(`proposal_version_bump_failed:${error.message}`);
  if (typeof data !== "number") throw new Error("proposal_version_bump_failed:empty_result");
  return data;
}
