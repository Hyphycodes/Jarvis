-- Security: pin a non-mutable search_path on match_memories (clears
-- function_search_path_mutable). `public` resolves memory_items; `extensions`
-- resolves the vector type and the <=> operator after the extension move.
-- Kept as its own migration so 20260101000015_semantic_memory.sql stays
-- byte-identical to the originally-applied definition.
alter function public.match_memories(vector, uuid, int) set search_path = public, extensions;
