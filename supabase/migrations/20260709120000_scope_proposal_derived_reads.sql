-- Third leak batch (siblings of 20260709100000/110000): four tables exposed
-- proposal-derived or per-user data through a blanket `true` SELECT policy —
-- the only policy on each, so simply dropping it would revoke owner access.
-- Replace each with an owner-scoped policy. Writes already go through the
-- service-role client (supabaseAdmin), which bypasses RLS, so read scoping
-- doesn't break generation.

-- agent_trace_steps: reasoning traces. Discovery/enrichment runs have NULL
-- user_id (system jobs) and are legitimate shared grant-catalog provenance;
-- evaluator/strategist/writer runs are per-user and reveal the org's fit
-- reasoning + proposal content. Allow: own runs OR system (NULL) runs.
drop policy if exists "authenticated_read_traces" on public.agent_trace_steps;
create policy "read own or system traces" on public.agent_trace_steps
  for select
  using (
    run_id in (
      select run_id from public.agent_runs
      where user_id = auth.uid() or user_id is null
    )
  );

-- compliance_matrices: generated per proposal → owner-only read.
drop policy if exists "Authenticated users can read compliance matrices" on public.compliance_matrices;
create policy "read own compliance matrices" on public.compliance_matrices
  for select
  using (proposal_id in (select id from public.proposals where user_id = auth.uid()));

-- proposal_reviews: multi-expert review of a proposal → owner-only read.
drop policy if exists "Authenticated users can read proposal reviews" on public.proposal_reviews;
create policy "read own proposal reviews" on public.proposal_reviews
  for select
  using (proposal_id in (select id from public.proposals where user_id = auth.uid()));

-- proposal_citation_reports: was FOR ALL with `true` (read AND write leak).
-- Scope every command to the owning proposal.
drop policy if exists "Authenticated can manage citation reports" on public.proposal_citation_reports;
create policy "manage own citation reports" on public.proposal_citation_reports
  for all
  using (proposal_id in (select id from public.proposals where user_id = auth.uid()))
  with check (proposal_id in (select id from public.proposals where user_id = auth.uid()));
