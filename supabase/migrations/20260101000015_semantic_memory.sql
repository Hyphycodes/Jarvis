-- =====================================================================
-- Semantic memory retrieval
-- =====================================================================
-- pgvector cosine-distance search over memory_items.embedding.
-- The `vector` extension and the embedding column are already created in
-- 0002_intelligence_foundation.sql. This adds the retrieval RPC plus a
-- supporting index.
--
-- `returns setof public.memory_items` keeps the result shape identical to a
-- normal row select, so the client maps results through the same toMemoryItem.
-- The function is plain `stable sql` (not security definer): RLS on
-- memory_items still applies to the caller, and the explicit user_id filter is
-- defense in depth.
-- =====================================================================

create or replace function public.match_memories(
  query_embedding vector,
  match_user_id uuid,
  match_limit int default 8
)
returns setof public.memory_items
language sql
stable
as $$
  select *
  from public.memory_items
  where user_id = match_user_id
    and status = 'active'
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_limit;
$$;

grant execute on function public.match_memories(vector, uuid, int)
  to authenticated, service_role;
