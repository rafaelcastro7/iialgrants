CREATE TABLE IF NOT EXISTS public.agent_trace_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      text NOT NULL,
  grant_id    uuid REFERENCES public.grants(id) ON DELETE CASCADE,
  agent       text NOT NULL,
  step        text NOT NULL,
  status      text NOT NULL DEFAULT 'info',
  message     text,
  payload     jsonb,
  duration_ms integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_trace_steps_run ON public.agent_trace_steps(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_trace_steps_grant ON public.agent_trace_steps(grant_id, created_at DESC);
GRANT SELECT ON public.agent_trace_steps TO authenticated;
GRANT ALL ON public.agent_trace_steps TO service_role;
ALTER TABLE public.agent_trace_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_traces"
  ON public.agent_trace_steps FOR SELECT
  TO authenticated USING (true);