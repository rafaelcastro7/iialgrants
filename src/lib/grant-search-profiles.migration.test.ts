import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = [
  "20260721234000_grant_search_profiles_feedback.sql",
  "20260721234500_grant_search_feedback_events_append_only.sql",
]
  .map((file) => readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"))
  .join("\n")
  .toLowerCase();

describe("grant search profile migration security contract", () => {
  it("enables RLS for every user-owned search table", () => {
    for (const table of [
      "grant_search_profiles",
      "grant_search_feedback",
      "grant_search_feedback_events",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("keeps feedback writes behind an authenticated, ownership-checking RPC", () => {
    expect(migration).toContain("security definer");
    expect(migration).toMatch(/v_user_id\s+uuid\s*:=\s*auth\.uid\(\)/);
    expect(migration).toContain("where id = p_profile_id and user_id = v_user_id");
    expect(migration).toContain("revoke all on function public.record_grant_search_feedback");
    expect(migration).toContain("grant execute on function public.record_grant_search_feedback");
    expect(migration).toContain("to authenticated");
  });

  it("makes feedback history append-only", () => {
    expect(migration).toContain("grant_search_feedback_events_no_mutation");
    expect(migration).toContain("before update or delete on public.grant_search_feedback_events");
  });
});
