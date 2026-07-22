
ALTER TABLE public.grants ADD COLUMN IF NOT EXISTS requirements JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.outcomes ADD COLUMN IF NOT EXISTS impact_description TEXT;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.search_grant_catalog(search_query text, result_limit integer DEFAULT 100)
RETURNS TABLE(grant_id uuid, relevance double precision, matched_on text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT g.id,
    (CASE
      WHEN lower(g.title) = lower(search_query) THEN 1.0
      WHEN lower(g.title) LIKE lower(search_query) || '%' THEN 0.7
      WHEN lower(g.title) LIKE '%' || lower(search_query) || '%' THEN 0.5
      WHEN lower(coalesce(f.name,'')) LIKE '%' || lower(search_query) || '%' THEN 0.4
      WHEN lower(coalesce(g.summary,'')) LIKE '%' || lower(search_query) || '%' THEN 0.3
      ELSE 0.0
    END)::double precision,
    (CASE
      WHEN lower(g.title) LIKE '%' || lower(search_query) || '%' THEN 'title'
      WHEN lower(coalesce(f.name,'')) LIKE '%' || lower(search_query) || '%' THEN 'funder'
      WHEN lower(coalesce(g.summary,'')) LIKE '%' || lower(search_query) || '%' THEN 'summary'
      ELSE 'related'
    END)
  FROM public.grants g
  LEFT JOIN public.funders f ON f.id = g.funder_id
  WHERE trim(search_query) <> '' AND (
    lower(g.title) LIKE '%' || lower(search_query) || '%'
    OR lower(coalesce(f.name,'')) LIKE '%' || lower(search_query) || '%'
    OR lower(coalesce(g.summary,'')) LIKE '%' || lower(search_query) || '%'
  )
  ORDER BY 2 DESC, g.fit_score DESC NULLS LAST
  LIMIT LEAST(GREATEST(result_limit, 1), 100);
$$;
REVOKE ALL ON FUNCTION public.search_grant_catalog(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.search_grant_catalog(text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_grant_search_feedback(
  p_profile_id uuid, p_grant_id uuid, p_action text,
  p_reason text DEFAULT NULL, p_note text DEFAULT NULL, p_query_text text DEFAULT NULL,
  p_rank_position integer DEFAULT NULL, p_score_snapshot jsonb DEFAULT '{}'::jsonb
) RETURNS public.grant_search_feedback
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user_id uuid := auth.uid(); v_row public.grant_search_feedback;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.grant_search_profiles WHERE id = p_profile_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'search_profile_not_found';
  END IF;
  INSERT INTO public.grant_search_feedback_events(profile_id, grant_id, user_id, action, reason, note, query_text, rank_position, score_snapshot)
  VALUES (p_profile_id, p_grant_id, v_user_id, p_action, p_reason, p_note, p_query_text, p_rank_position, coalesce(p_score_snapshot, '{}'::jsonb));
  INSERT INTO public.grant_search_feedback(profile_id, grant_id, user_id, action, reason, note, query_text, rank_position, score_snapshot)
  VALUES (p_profile_id, p_grant_id, v_user_id, p_action, p_reason, p_note, p_query_text, p_rank_position, coalesce(p_score_snapshot, '{}'::jsonb))
  ON CONFLICT (profile_id, grant_id, user_id) DO UPDATE SET action=excluded.action, reason=excluded.reason, note=excluded.note, query_text=excluded.query_text, rank_position=excluded.rank_position, score_snapshot=excluded.score_snapshot, updated_at=now()
  RETURNING * INTO v_row;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.record_grant_search_feedback(uuid,uuid,text,text,text,text,integer,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.record_grant_search_feedback(uuid,uuid,text,text,text,text,integer,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bump_proposal_version(target_proposal_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE next_version integer;
BEGIN
  UPDATE public.proposals SET version = greatest(coalesce(version,1),1)+1
   WHERE id = target_proposal_id AND user_id = auth.uid()
   RETURNING version INTO next_version;
  IF next_version IS NULL THEN RAISE EXCEPTION 'proposal_not_found_or_forbidden' USING errcode='P0002'; END IF;
  RETURN next_version;
END; $$;
REVOKE ALL ON FUNCTION public.bump_proposal_version(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.bump_proposal_version(uuid) TO authenticated, service_role;
