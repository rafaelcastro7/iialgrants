-- Closes a real gap surfaced by an external audit of AI grant-writing tools:
-- (1) there was no way for a human to actually edit AI-drafted section text
--     before submission (content_en was only ever written by the writer
--     agent) — so "human review" could only ever mean "read it," never
--     "took responsibility for it";
-- (2) the submit gate's `force: true` bypass could skip every quality check,
--     including the (nonexistent) human-accountability step, with zero
--     record that a human ever looked at the content before it went to a
--     real funder — a real compliance/liability exposure now that some
--     funders (e.g. NIH Notice NOT-OD-25-132) penalize substantially
--     AI-authored applications with cost disallowance or termination;
-- (3) there was no data captured anywhere to ever correlate "how much of
--     this proposal was AI-authored, unedited" with win/loss outcomes — the
--     one feedback loop that would tell us whether the AI drafting feature
--     helps or hurts.
alter table public.proposal_sections
  add column if not exists human_edited boolean not null default false;

alter table public.proposals
  add column if not exists human_reviewed_at timestamptz;

-- Snapshot at submission time — % of sections a human edited after the AI
-- drafted them. Captured once, at submit, because sections can keep changing
-- after submission (re-drafts) and the outcome must be attributed to what
-- was actually sent, not to whatever the record looks like later.
alter table public.submissions
  add column if not exists human_edited_pct numeric;
