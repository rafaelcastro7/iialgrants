-- Fix embedding dimension mismatch that silently broke ALL RAG ingestion.
--
-- knowledge_chunks.embedding was vector(1536) (OpenAI ada-002 era), but the
-- local-first stack embeds with nomic-embed-text which produces 768 dims. Every
-- insert therefore failed with "expected 1536 dimensions, not 768", so
-- knowledge_chunks could never be populated — which in turn dead-ended the
-- proposal writer (no_knowledge_chunks) and semantic search.
--
-- The table is empty, so retype in place. Recreate the HNSW cosine index.
-- match_knowledge_chunks(query_embedding vector, ...) is dimension-agnostic and
-- needs no change.

DROP INDEX IF EXISTS public.knowledge_chunks_embedding_idx;

ALTER TABLE public.knowledge_chunks
  ALTER COLUMN embedding TYPE vector(768);

CREATE INDEX knowledge_chunks_embedding_idx
  ON public.knowledge_chunks USING hnsw (embedding vector_cosine_ops);
