-- Cross-tenant leak: the "Org members can view org {proposals,submissions}"
-- SELECT policies granted read when `org_id IS NULL`, but a NULL org_id means
-- "not yet assigned to an org" (all demo proposals have it), so those rows were
-- readable by EVERY authenticated user — a member saw the admin's proposal in
-- their activity feed. A NULL org_id must mean "private to the owner", not
-- "public". The owner is already covered by the separate "own proposals" /
-- "Users manage their submissions" (user_id = auth.uid()) policies, so dropping
-- the NULL escape keeps owner access intact while closing the leak. Real org
-- sharing (org_id set + matching membership) is unchanged.

drop policy if exists "Org members can view org proposals" on public.proposals;
create policy "Org members can view org proposals" on public.proposals
  for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()));

drop policy if exists "Org members can view org submissions" on public.submissions;
create policy "Org members can view org submissions" on public.submissions
  for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
