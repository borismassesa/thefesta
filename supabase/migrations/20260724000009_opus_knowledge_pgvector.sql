-- Persistent vector store for Opus RAG (replaces the per-instance in-memory
-- index). Embeddings are text-embedding-3-small (1536 dims). Service-role only.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.opus_knowledge_chunks (
  id text PRIMARY KEY,            -- stable key, e.g. 'vendor:<slug>'
  source_type text NOT NULL,      -- vendor | article | faq
  source_id text NOT NULL,
  title text NOT NULL,
  url text,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.opus_knowledge_chunks IS
  'Opus RAG knowledge base: one embedded chunk per vendor/article/FAQ. Service-role only; refreshed by /api/opus/reindex.';

ALTER TABLE public.opus_knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS opus_knowledge_chunks_embedding_idx
  ON public.opus_knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- Cosine-similarity search. SECURITY DEFINER + REVOKE so it is not exposed as
-- an unauthenticated PostgREST RPC (service-role callers still reach it).
CREATE OR REPLACE FUNCTION public.match_opus_knowledge(
  query_embedding vector(1536),
  match_count int
) RETURNS TABLE (
  source_type text,
  source_id text,
  title text,
  url text,
  content text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT source_type, source_id, title, url, content,
         1 - (embedding <=> query_embedding) AS similarity
  FROM public.opus_knowledge_chunks
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
REVOKE ALL ON FUNCTION public.match_opus_knowledge(vector, int) FROM PUBLIC;
