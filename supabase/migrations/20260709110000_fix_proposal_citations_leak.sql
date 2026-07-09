-- Cross-tenant leak (sibling of 20260709100000): proposal_citations had a
-- SELECT policy "Authenticated users can read proposal citations" whose USING
-- clause was literally `true`, so every authenticated user could read every
-- user's citations — including the verbatim `snippet` quotes pulled from other
-- orgs' proposals and knowledge base. Confirmed empirically: demo-member-a
-- (owns 0 citations) could read 12 of the admin's.
--
-- The correct "own citations select" (user_id = auth.uid()) policy already
-- grants owners their rows, so dropping the permissive one closes the leak
-- with no loss of legitimate access. (If org-shared citation review is wanted
-- later, add an org-scoped policy mirroring proposals — NOT a blanket true.)

drop policy if exists "Authenticated users can read proposal citations" on public.proposal_citations;
