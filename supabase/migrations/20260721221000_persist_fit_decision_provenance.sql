-- Preserve the exact inputs behind every fit decision. fit_score remains the
-- final combined 0..1 score; llm_fit_score is the model-only score and
-- rule_snapshot records deterministic checks/config at evaluation time.
alter table public.grant_evaluations
  add column if not exists llm_fit_score numeric(4,3)
    check (llm_fit_score is null or (llm_fit_score >= 0 and llm_fit_score <= 1)),
  add column if not exists rule_snapshot jsonb,
  add column if not exists evaluated_at timestamptz not null default now();

comment on column public.grant_evaluations.fit_score is
  'Final combined score after deterministic-rule and LLM weighting (0..1).';
comment on column public.grant_evaluations.llm_fit_score is
  'Raw model-only fit score before deterministic-rule weighting (0..1).';
comment on column public.grant_evaluations.rule_snapshot is
  'Exact serializable deterministic rule result and thresholds used for this evaluation.';
