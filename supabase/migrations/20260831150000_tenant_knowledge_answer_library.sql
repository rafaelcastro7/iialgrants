-- Share reusable evidence and answers across a tenant. Previously every RAG
-- chunk was private to one user, so IIAL colleagues could not reuse the same
-- approved organizational history or capability statement.

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

UPDATE public.knowledge_chunks k
SET org_id = p.org_id
FROM public.profiles p
WHERE p.id = k.user_id AND k.org_id IS NULL AND p.org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS knowledge_chunks_org_idx ON public.knowledge_chunks(org_id);

DROP POLICY IF EXISTS knowledge_chunks_org_select ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_org_select ON public.knowledge_chunks
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (org_id IS NOT NULL AND org_id = (
      SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()
    ))
  );

-- Keep the existing own-chunks write policy; a user can create tenant content
-- only under their own user_id. The org_id check prevents cross-tenant labels.
DROP POLICY IF EXISTS knowledge_chunks_org_insert ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_org_insert ON public.knowledge_chunks
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (org_id IS NULL OR org_id = (
      SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS knowledge_chunks_org_update ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_org_update ON public.knowledge_chunks
  FOR UPDATE TO authenticated
  USING (org_id IS NOT NULL AND org_id = (
    SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()
  ))
  WITH CHECK (org_id = (
    SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()
  ));

DROP POLICY IF EXISTS knowledge_chunks_org_delete ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_org_delete ON public.knowledge_chunks
  FOR DELETE TO authenticated
  USING (org_id IS NOT NULL AND org_id = (
    SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding vector,
  match_user_id uuid,
  match_count int DEFAULT 6
)
RETURNS TABLE (
  id uuid,
  content text,
  source text,
  language public.app_lang,
  similarity float
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT k.id, k.content, k.source, k.language,
         1 - (k.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks k
  WHERE k.embedding IS NOT NULL
    AND (
      k.user_id = match_user_id
      OR (
        k.org_id IS NOT NULL
        AND k.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = match_user_id)
      )
    )
  ORDER BY k.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 50);
$$;
REVOKE ALL ON FUNCTION public.match_knowledge_chunks(vector, uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(vector, uuid, int)
  TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.answer_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  label text NOT NULL,
  question text,
  answer_en text NOT NULL,
  answer_fr text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  evidence_notes text,
  knowledge_chunk_id uuid UNIQUE REFERENCES public.knowledge_chunks(id) ON DELETE SET NULL,
  verified_at timestamptz,
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  last_used_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(label)) > 0),
  CHECK (length(trim(answer_en)) >= 20)
);

CREATE INDEX IF NOT EXISTS answer_library_org_active_idx
  ON public.answer_library(org_id, updated_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS answer_library_tags_gin
  ON public.answer_library USING gin(tags);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.answer_library TO authenticated;
GRANT ALL ON public.answer_library TO service_role;
ALTER TABLE public.answer_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS answer_library_org_all ON public.answer_library;
CREATE POLICY answer_library_org_all ON public.answer_library
  FOR ALL TO authenticated
  USING (org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (
    org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())
    AND created_by IN (
      SELECT p.id FROM public.profiles p
      WHERE p.org_id = (SELECT me.org_id FROM public.profiles me WHERE me.id = auth.uid())
    )
  );

DROP TRIGGER IF EXISTS answer_library_set_updated_at ON public.answer_library;
CREATE TRIGGER answer_library_set_updated_at
  BEFORE UPDATE ON public.answer_library
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.answer_library IS
  'Tenant-owned approved responses reusable across applications; indexed into knowledge_chunks for drafting.';
